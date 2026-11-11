import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import { completeBooking } from '../booking/booking.service';
import { priceOrder } from './pricing';
import type { AuthContext } from '../../middlewares/auth.middleware';
import type { CheckoutInput } from './finance.schema';

const registerClosed = () => new HttpError(409, 'O caixa está fechado. Abra o caixa para cobrar.', 'REGISTER_CLOSED');

export const orderInclude = {
  items: true,
  payments: true,
  barber: { select: { id: true, user: { select: { name: true } } } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

async function openRegister(tenantId: string) {
  return prisma.cashRegister.findFirst({ where: { tenantId, closedAt: null } });
}

/** Totais do caixa: por forma de pagamento, gorjetas, suprimentos/sangrias e dinheiro esperado na gaveta. */
async function registerSummary(registerId: string) {
  const register = await prisma.cashRegister.findUniqueOrThrow({
    where: { id: registerId },
    include: { movements: { orderBy: { createdAt: 'asc' } }, openedBy: { select: { user: { select: { name: true } } } } },
  });
  const [byMethod, totals] = await Promise.all([
    prisma.payment.groupBy({ by: ['method'], where: { order: { registerId, status: 'PAID' } }, _sum: { amountCents: true } }),
    prisma.order.aggregate({ where: { registerId, status: 'PAID' }, _sum: { totalCents: true, tipCents: true }, _count: true }),
  ]);
  const method = (m: string) => byMethod.find((r) => r.method === m)?._sum.amountCents ?? 0;
  const moved = (t: 'DEPOSIT' | 'WITHDRAWAL') => register.movements.filter((m) => m.type === t).reduce((s, m) => s + m.amountCents, 0);
  const expectedCashCents = register.openingCents + method('CASH') + moved('DEPOSIT') - moved('WITHDRAWAL');

  return {
    ...register,
    openedByName: register.openedBy.user.name,
    orders: totals._count,
    totalCents: totals._sum.totalCents ?? 0,
    tipsCents: totals._sum.tipCents ?? 0,
    byMethod: { PIX: method('PIX'), CREDIT: method('CREDIT'), DEBIT: method('DEBIT'), CASH: method('CASH') },
    depositsCents: moved('DEPOSIT'),
    withdrawalsCents: moved('WITHDRAWAL'),
    expectedCashCents,
    differenceCents: register.countedCashCents === null ? null : register.countedCashCents - expectedCashCents,
  };
}

export const financeService = {
  /**
   * Fecha uma comanda: preços vêm do banco (nunca do navegador), estoque sai na mesma transação
   * e, se for de um agendamento, o agendamento é concluído junto. Um agendamento só gera uma comanda (UNIQUE).
   */
  async checkout(auth: AuthContext, input: CheckoutInput) {
    const register = await openRegister(auth.tenantId);
    if (!register) throw registerClosed();

    // Quem atendeu e de quem é o cliente
    let barberId = input.barberId ?? null;
    let clientId = input.clientId ?? null;
    let booking: Prisma.BookingGetPayload<object> | null = null;
    if (input.bookingId) {
      booking = await prisma.booking.findFirst({ where: { id: input.bookingId, tenantId: auth.tenantId } });
      if (!booking) throw new HttpError(404, 'Agendamento não encontrado', 'NOT_FOUND');
      barberId = booking.barberId;
      clientId = booking.clientId;
    }
    if (auth.role === 'BARBER' && barberId !== auth.membershipId) {
      throw new HttpError(403, 'Barbeiro só fecha comanda dos próprios atendimentos', 'FORBIDDEN');
    }
    const barber = barberId ? await prisma.membership.findFirst({ where: { id: barberId, tenantId: auth.tenantId } }) : null;
    if (barberId && !barber) throw new HttpError(404, 'Profissional não encontrado', 'BARBER_NOT_FOUND');
    if (clientId && !(await prisma.client.findFirst({ where: { id: clientId, tenantId: auth.tenantId } }))) {
      throw new HttpError(404, 'Cliente não encontrado', 'NOT_FOUND');
    }

    // Itens com preço do cadastro. O serviço do agendamento usa o preço reservado (snapshot).
    const serviceIds = input.items.filter((i) => i.kind === 'SERVICE').map((i) => i.id);
    const productIds = input.items.filter((i) => i.kind === 'PRODUCT').map((i) => i.id);
    const [services, products] = await Promise.all([
      prisma.service.findMany({ where: { tenantId: auth.tenantId, id: { in: serviceIds } } }),
      prisma.product.findMany({ where: { tenantId: auth.tenantId, id: { in: productIds }, active: true } }),
    ]);
    if (serviceIds.length && !barber) throw new HttpError(400, 'Informe quem fez o serviço', 'BARBER_REQUIRED');

    let bookingPriceUsed = false;
    const lines = input.items.map((i) => {
      if (i.kind === 'SERVICE') {
        const s = services.find((x) => x.id === i.id);
        if (!s) throw new HttpError(400, 'Serviço inválido', 'INVALID_ITEM');
        const useBookingPrice = booking && !bookingPriceUsed && s.id === booking.serviceId;
        if (useBookingPrice) bookingPriceUsed = true;
        return { ...i, description: s.name, unitPriceCents: useBookingPrice ? booking!.priceCents : s.priceCents, commissionPct: barber?.serviceCommissionPct ?? 0 };
      }
      const p = products.find((x) => x.id === i.id);
      if (!p) throw new HttpError(400, 'Produto inválido ou inativo', 'INVALID_ITEM');
      return { ...i, description: p.name, unitPriceCents: p.priceCents, commissionPct: barber?.productCommissionPct ?? 0 };
    });

    let priced;
    try {
      priced = priceOrder(lines, input.discountCents, input.tipCents);
    } catch (e) {
      throw new HttpError(400, (e as Error).message, 'INVALID_AMOUNTS');
    }
    const paid = input.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paid !== priced.totalCents) {
      const brl = (c: number) => (c / 100).toFixed(2).replace('.', ',');
      throw new HttpError(400, `Pagamentos somam R$ ${brl(paid)}, mas o total é R$ ${brl(priced.totalCents)}`, 'PAYMENT_MISMATCH');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            tenantId: auth.tenantId,
            registerId: register.id,
            bookingId: booking?.id,
            clientId,
            barberId,
            subtotalCents: priced.subtotalCents,
            discountCents: priced.discountCents,
            tipCents: priced.tipCents,
            totalCents: priced.totalCents,
            createdById: auth.membershipId,
            items: {
              create: priced.lines.map((l, idx) => ({
                kind: lines[idx].kind,
                serviceId: lines[idx].kind === 'SERVICE' ? lines[idx].id : null,
                productId: lines[idx].kind === 'PRODUCT' ? lines[idx].id : null,
                description: lines[idx].description,
                quantity: l.quantity,
                unitPriceCents: l.unitPriceCents,
                totalCents: l.totalCents,
                commissionCents: l.commissionCents,
              })),
            },
            payments: { create: input.payments },
          },
          include: orderInclude,
        });

        // Baixa de estoque atômica: falha a comanda inteira se faltar produto.
        for (const l of lines.filter((x) => x.kind === 'PRODUCT')) {
          const { count } = await tx.product.updateMany({
            where: { id: l.id, stockQuantity: { gte: l.quantity } },
            data: { stockQuantity: { decrement: l.quantity } },
          });
          if (count === 0) throw new HttpError(400, `Estoque insuficiente de ${l.description}`, 'INSUFFICIENT_STOCK');
          await tx.stockMovement.create({
            data: { productId: l.id, membershipId: auth.membershipId, type: 'OUT', quantity: l.quantity, reason: `Venda (comanda ${order.id.slice(0, 8)})` },
          });
        }

        if (booking) await completeBooking(tx, booking, auth.tenantId);
        return order;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'Este agendamento já tem comanda fechada', 'ALREADY_CHARGED');
      }
      throw e;
    }
  },

  /** Estorno: a comanda fica registrada como estornada e os produtos voltam ao estoque. */
  async voidOrder(auth: AuthContext, id: string, reason: string) {
    const order = await prisma.order.findFirst({ where: { id, tenantId: auth.tenantId }, include: { items: true } });
    if (!order) throw new HttpError(404, 'Comanda não encontrada', 'NOT_FOUND');
    if (order.status === 'VOIDED') throw new HttpError(400, 'Comanda já estornada', 'ALREADY_VOIDED');
    if (order.items.some((i) => i.commissionPaidAt)) {
      throw new HttpError(400, 'A comissão desta comanda já foi paga. Ajuste o pagamento de comissão antes de estornar.', 'COMMISSION_PAID');
    }

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: 'PAID' },
        data: { status: 'VOIDED', voidReason: reason, voidedById: auth.membershipId, voidedAt: new Date() },
      });
      if (count === 0) throw new HttpError(409, 'A comanda foi alterada por outra pessoa. Recarregue.', 'STALE');
      for (const i of order.items.filter((x) => x.productId)) {
        await tx.product.update({ where: { id: i.productId! }, data: { stockQuantity: { increment: i.quantity } } });
        await tx.stockMovement.create({
          data: { productId: i.productId!, membershipId: auth.membershipId, type: 'IN', quantity: i.quantity, reason: `Estorno (comanda ${id.slice(0, 8)})` },
        });
      }
      return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  },

  async listOrders(auth: AuthContext, where: Prisma.OrderWhereInput) {
    return prisma.order.findMany({
      where: { ...where, tenantId: auth.tenantId, ...(auth.role === 'BARBER' ? { barberId: auth.membershipId } : {}) },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  // ===== Caixa =====

  async currentRegister(tenantId: string) {
    const r = await openRegister(tenantId);
    return r ? registerSummary(r.id) : null;
  },

  async open(auth: AuthContext, openingCents: number) {
    try {
      const r = await prisma.cashRegister.create({ data: { tenantId: auth.tenantId, openedById: auth.membershipId, openingCents } });
      return registerSummary(r.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'Já existe um caixa aberto', 'REGISTER_ALREADY_OPEN');
      }
      throw e;
    }
  },

  async addMovement(auth: AuthContext, type: 'DEPOSIT' | 'WITHDRAWAL', amountCents: number, reason: string) {
    const r = await openRegister(auth.tenantId);
    if (!r) throw registerClosed();
    if (type === 'WITHDRAWAL') {
      const s = await registerSummary(r.id);
      if (amountCents > s.expectedCashCents) throw new HttpError(400, 'Sangria maior que o dinheiro no caixa', 'INSUFFICIENT_CASH');
    }
    await prisma.cashMovement.create({ data: { registerId: r.id, membershipId: auth.membershipId, type, amountCents, reason } });
    return registerSummary(r.id);
  },

  async close(auth: AuthContext, countedCashCents: number, notes?: string) {
    const r = await openRegister(auth.tenantId);
    if (!r) throw registerClosed();
    const { count } = await prisma.cashRegister.updateMany({
      where: { id: r.id, closedAt: null },
      data: { closedAt: new Date(), closedById: auth.membershipId, countedCashCents, notes },
    });
    if (count === 0) throw new HttpError(409, 'O caixa já foi fechado', 'STALE');
    return registerSummary(r.id);
  },

  async registerHistory(tenantId: string) {
    const list = await prisma.cashRegister.findMany({ where: { tenantId, closedAt: { not: null } }, orderBy: { openedAt: 'desc' }, take: 30 });
    return Promise.all(list.map((r) => registerSummary(r.id)));
  },
};
