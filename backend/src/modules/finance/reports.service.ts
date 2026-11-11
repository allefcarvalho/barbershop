import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { addDays, dayRangeUtc } from '../../utils/time';
import { HttpError } from '../../utils/apiResponse';
import type { AuthContext } from '../../middlewares/auth.middleware';

/** Período em datas do fuso da barbearia → intervalo UTC [início do "de", fim do "até"). */
async function periodRange(tenantId: string, from: string, to: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return { tz: tenant.timezone, start: dayRangeUtc(from, tenant.timezone).start, end: dayRangeUtc(addDays(to, 1), tenant.timezone).start };
}

const n = (v: bigint | number | null) => Number(v ?? 0);

export const reportsService = {
  /** Relatório gerencial do período. Comandas estornadas não entram. */
  async summary(tenantId: string, from: string, to: string) {
    const { tz, start, end } = await periodRange(tenantId, from, to);
    const paid = Prisma.sql`o.tenant_id = ${tenantId} AND o.status = 'PAID' AND o.created_at >= ${start} AND o.created_at < ${end}`;

    const [totals, byMethod, byBarber, byItem, byDay, bookings, newClients, recurringServed] = await Promise.all([
      prisma.$queryRaw<{ orders: bigint; subtotal: bigint; discount: bigint; tips: bigint; total: bigint }[]>`
        SELECT count(*) AS orders, sum(subtotal_cents) AS subtotal, sum(discount_cents) AS discount,
               sum(tip_cents) AS tips, sum(total_cents) AS total
        FROM orders o WHERE ${paid}`,
      prisma.$queryRaw<{ method: string; amount: bigint }[]>`
        SELECT p.method, sum(p.amount_cents) AS amount
        FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${paid} GROUP BY p.method`,
      prisma.$queryRaw<{ barber_id: string; name: string; revenue: bigint; services: bigint; commission: bigint; tips: bigint }[]>`
        SELECT m.id AS barber_id, u.name,
               coalesce(sum(i.total_cents), 0) AS revenue,
               coalesce(sum(i.quantity) FILTER (WHERE i.kind = 'SERVICE'), 0) AS services,
               coalesce(sum(i.commission_cents), 0) AS commission,
               (SELECT coalesce(sum(o2.tip_cents), 0) FROM orders o2
                 WHERE o2.barber_id = m.id AND o2.status = 'PAID' AND o2.created_at >= ${start} AND o2.created_at < ${end}) AS tips
        FROM orders o
        JOIN memberships m ON m.id = o.barber_id
        JOIN users u ON u.id = m.user_id
        JOIN order_items i ON i.order_id = o.id
        WHERE ${paid}
        GROUP BY m.id, u.name ORDER BY revenue DESC`,
      prisma.$queryRaw<{ kind: string; description: string; quantity: bigint; revenue: bigint }[]>`
        SELECT i.kind, i.description, sum(i.quantity) AS quantity, sum(i.total_cents) AS revenue
        FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${paid}
        GROUP BY i.kind, i.description ORDER BY revenue DESC`,
      prisma.$queryRaw<{ day: string; orders: bigint; revenue: bigint }[]>`
        SELECT to_char(o.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, count(*) AS orders,
               sum(o.subtotal_cents - o.discount_cents) AS revenue
        FROM orders o WHERE ${paid} GROUP BY day ORDER BY day`,
      prisma.booking.groupBy({ by: ['status'], where: { tenantId, startAt: { gte: start, lt: end } }, _count: true }),
      prisma.client.count({ where: { tenantId, createdAt: { gte: start, lt: end } } }),
      prisma.$queryRaw<{ total: bigint; recurring: bigint }[]>`
        SELECT count(DISTINCT c.id) AS total, count(DISTINCT c.id) FILTER (WHERE c.is_recurring) AS recurring
        FROM orders o JOIN clients c ON c.id = o.client_id WHERE ${paid}`,
    ]);

    const t = totals[0];
    const revenueCents = n(t.subtotal) - n(t.discount); // faturamento sem gorjeta (gorjeta é do profissional)
    const status = (s: string) => bookings.find((b) => b.status === s)?._count ?? 0;
    const attended = status('COMPLETED') + status('NO_SHOW');

    return {
      period: { from, to },
      orders: n(t.orders),
      grossCents: n(t.subtotal),
      discountCents: n(t.discount),
      revenueCents,
      tipsCents: n(t.tips),
      receivedCents: n(t.total),
      averageTicketCents: n(t.orders) ? Math.round(revenueCents / n(t.orders)) : 0,
      byMethod: Object.fromEntries(['PIX', 'CREDIT', 'DEBIT', 'CASH'].map((m) => [m, n(byMethod.find((r) => r.method === m)?.amount ?? 0)])),
      byBarber: byBarber.map((b) => ({
        barberId: b.barber_id,
        name: b.name,
        revenueCents: n(b.revenue),
        services: n(b.services),
        commissionCents: n(b.commission),
        tipsCents: n(b.tips),
      })),
      topServices: byItem.filter((i) => i.kind === 'SERVICE').map((i) => ({ name: i.description, quantity: n(i.quantity), revenueCents: n(i.revenue) })),
      topProducts: byItem.filter((i) => i.kind === 'PRODUCT').map((i) => ({ name: i.description, quantity: n(i.quantity), revenueCents: n(i.revenue) })),
      byDay: byDay.map((d) => ({ day: d.day, orders: n(d.orders), revenueCents: n(d.revenue) })),
      bookings: {
        completed: status('COMPLETED'),
        noShow: status('NO_SHOW'),
        cancelled: status('CANCELLED'),
        noShowRate: attended ? status('NO_SHOW') / attended : 0,
      },
      clients: { new: newClients, served: n(recurringServed[0].total), recurringServed: n(recurringServed[0].recurring) },
    };
  },

  /** Comissões por profissional no período: a pagar e já pagas. Barbeiro vê só as próprias. */
  async commissions(auth: AuthContext, from: string, to: string) {
    const { start, end } = await periodRange(auth.tenantId, from, to);
    const own = auth.role === 'BARBER' ? Prisma.sql`AND o.barber_id = ${auth.membershipId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ barber_id: string; name: string; pending: bigint; paid: bigint; services: bigint; products: bigint }[]>`
      SELECT m.id AS barber_id, u.name,
             coalesce(sum(i.commission_cents) FILTER (WHERE i.commission_paid_at IS NULL), 0) AS pending,
             coalesce(sum(i.commission_cents) FILTER (WHERE i.commission_paid_at IS NOT NULL), 0) AS paid,
             coalesce(sum(i.commission_cents) FILTER (WHERE i.kind = 'SERVICE'), 0) AS services,
             coalesce(sum(i.commission_cents) FILTER (WHERE i.kind = 'PRODUCT'), 0) AS products
      FROM orders o
      JOIN order_items i ON i.order_id = o.id
      JOIN memberships m ON m.id = o.barber_id
      JOIN users u ON u.id = m.user_id
      WHERE o.tenant_id = ${auth.tenantId} AND o.status = 'PAID' AND o.created_at >= ${start} AND o.created_at < ${end} ${own}
      GROUP BY m.id, u.name ORDER BY u.name`;
    return rows.map((r) => ({
      barberId: r.barber_id,
      name: r.name,
      pendingCents: n(r.pending),
      paidCents: n(r.paid),
      servicesCents: n(r.services),
      productsCents: n(r.products),
    }));
  },

  /** Marca como paga a comissão pendente de um profissional no período. */
  async payCommission(auth: AuthContext, barberId: string, from: string, to: string) {
    const barber = await prisma.membership.findFirst({ where: { id: barberId, tenantId: auth.tenantId } });
    if (!barber) throw new HttpError(404, 'Profissional não encontrado', 'BARBER_NOT_FOUND');
    const { start, end } = await periodRange(auth.tenantId, from, to);
    const items = await prisma.orderItem.findMany({
      where: { commissionPaidAt: null, commissionCents: { gt: 0 }, order: { tenantId: auth.tenantId, barberId, status: 'PAID', createdAt: { gte: start, lt: end } } },
      select: { id: true, commissionCents: true },
    });
    if (items.length === 0) throw new HttpError(400, 'Não há comissão pendente neste período', 'NOTHING_TO_PAY');
    await prisma.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) }, commissionPaidAt: null }, data: { commissionPaidAt: new Date() } });
    return { items: items.length, amountCents: items.reduce((s, i) => s + i.commissionCents, 0) };
  },
};
