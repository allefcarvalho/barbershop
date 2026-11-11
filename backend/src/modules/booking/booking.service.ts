import { createHash, randomBytes } from 'node:crypto';
import { BookingSource, BookingStatus, Prisma, Tenant } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import { addMinutes, dayRangeUtc, utcToZoned, zonedToUtc } from '../../utils/time';
import { availabilityService } from '../availability/availability.service';
import type { AuthContext } from '../../middlewares/auth.middleware';
import type { CreateBookingInput, StaffBookingInput, RescheduleInput, BookingFiltersInput } from './booking.schema';

const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const slotTaken = () => new HttpError(409, 'Este horário já está ocupado para este barbeiro.', 'SLOT_TAKEN');

/** Violação da constraint EXCLUDE "bookings_no_overlap" (SQLSTATE 23P01). */
function isOverlapError(e: unknown) {
  return e instanceof Error && /bookings_no_overlap|23P01/.test(e.message);
}

const listInclude = {
  client: { select: { id: true, name: true, phone: true, isRecurring: true } },
  barber: { select: { id: true, user: { select: { name: true } } } },
  service: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

/** Barbeiro ativo do tenant que faz o serviço + o serviço ativo. */
async function getBarberAndService(tenantId: string, barberId: string, serviceId: string) {
  const [barber, service] = await Promise.all([
    prisma.membership.findFirst({
      where: { id: barberId, tenantId, active: true, user: { active: true }, services: { some: { serviceId } } },
      include: { user: { select: { name: true } } },
    }),
    prisma.service.findFirst({ where: { id: serviceId, tenantId, active: true } }),
  ]);
  if (!service) throw new HttpError(404, 'Serviço não encontrado', 'SERVICE_NOT_FOUND');
  if (!barber) throw new HttpError(404, 'Barbeiro não encontrado ou não faz este serviço', 'BARBER_NOT_FOUND');
  return { barber, service };
}

/**
 * Conclui um agendamento em aberto e atualiza as estatísticas do cliente (recorrência).
 * Usado pela mudança de status e pela comanda. Atualização condicional evita concluir duas vezes.
 */
export async function completeBooking(
  tx: Prisma.TransactionClient,
  booking: { id: string; status: BookingStatus; clientId: string; startAt: Date },
  tenantId: string,
) {
  if (!ACTIVE.includes(booking.status)) {
    throw new HttpError(400, 'Este agendamento não está em aberto', 'INVALID_TRANSITION');
  }
  const { count } = await tx.booking.updateMany({ where: { id: booking.id, status: booking.status }, data: { status: 'COMPLETED' } });
  if (count === 0) throw new HttpError(409, 'O agendamento foi alterado por outra pessoa. Recarregue.', 'STALE');

  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const client = await tx.client.update({
    where: { id: booking.clientId },
    data: { totalBookings: { increment: 1 }, lastVisit: booking.startAt },
  });
  if (!client.isRecurring && client.totalBookings >= tenant.recurringThreshold) {
    await tx.client.update({ where: { id: client.id }, data: { isRecurring: true } });
  }
}

interface NewBooking {
  tenant: Tenant;
  barberId: string;
  serviceId: string;
  startAt: Date;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  notes?: string;
  source: BookingSource;
  status: BookingStatus;
  consent?: boolean;
  /** Agendamento online: limita agendamentos em aberto por telefone. */
  enforceActiveLimit?: boolean;
}

/** Grava cliente + agendamento + notificação numa transação. A constraint EXCLUDE resolve corridas. */
async function insertBooking(b: NewBooking) {
  const { barber, service } = await getBarberAndService(b.tenant.id, b.barberId, b.serviceId);
  const endAt = addMinutes(b.startAt, service.durationMinutes);
  const manageToken = randomBytes(24).toString('base64url');

  try {
    return await prisma.$transaction(async (tx) => {
      // RN07: o telefone identifica o cliente, mas o agendamento NÃO sobrescreve dados existentes.
      const client = await tx.client.upsert({
        where: { tenantId_phone: { tenantId: b.tenant.id, phone: b.clientPhone } },
        update: b.consent ? { consentAt: new Date() } : {},
        create: {
          tenantId: b.tenant.id,
          name: b.clientName,
          phone: b.clientPhone,
          email: b.clientEmail,
          consentAt: b.consent ? new Date() : null,
        },
      });

      if (b.enforceActiveLimit) {
        const active = await tx.booking.count({ where: { clientId: client.id, status: { in: ACTIVE }, startAt: { gt: new Date() } } });
        if (active >= b.tenant.maxActiveBookingsPerPhone) {
          throw new HttpError(409, 'Você já tem agendamentos em aberto. Cancele um para marcar outro.', 'TOO_MANY_ACTIVE');
        }
      }

      // Nome digitado diferente do cadastro fica registrado para a equipe conferir.
      const nameNote = client.name !== b.clientName ? `Nome informado: ${b.clientName}` : undefined;

      const booking = await tx.booking.create({
        data: {
          tenantId: b.tenant.id,
          clientId: client.id,
          barberId: barber.id,
          serviceId: service.id,
          startAt: b.startAt,
          endAt,
          status: b.status,
          source: b.source,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
          notes: [nameNote, b.notes].filter(Boolean).join(' · ') || null,
          manageTokenHash: sha256(manageToken),
        },
        include: listInclude,
      });

      await tx.notification.create({
        data: {
          bookingId: booking.id,
          type: 'CONFIRMATION',
          payload: JSON.stringify({ bookingId: booking.id, startAt: b.startAt, serviceName: service.name, barberName: barber.user.name }),
        },
      });

      return { booking, manageToken };
    });
  } catch (e) {
    if (isOverlapError(e)) throw slotTaken();
    throw e;
  }
}

export const bookingService = {
  /**
   * Agendamento público. Duas barreiras contra double booking:
   * 1) o horário precisa estar na lista do motor de slots (jornada, bloqueios, antecedência);
   * 2) a constraint EXCLUDE no banco resolve a corrida entre requisições simultâneas.
   */
  async createPublic(tenant: Tenant, data: CreateBookingInput) {
    const slots = await availabilityService.getSlots(tenant, data.barberId, data.date, data.serviceId);
    if (!slots.includes(data.time)) {
      throw new HttpError(409, 'Horário indisponível. Escolha outro.', 'SLOT_UNAVAILABLE');
    }

    const { booking, manageToken } = await insertBooking({
      tenant,
      ...data,
      startAt: zonedToUtc(data.date, data.time, tenant.timezone),
      source: 'ONLINE',
      status: tenant.requireConfirmation ? 'PENDING' : 'CONFIRMED',
      consent: data.acceptTerms,
      enforceActiveLimit: true,
    });

    // Resposta pública: sem dados do cadastro do cliente. O token só aparece aqui, uma vez.
    return {
      id: booking.id,
      startAt: booking.startAt,
      endAt: booking.endAt,
      status: booking.status,
      priceCents: booking.priceCents,
      service: booking.service,
      barber: { id: booking.barber.id, name: booking.barber.user.name },
      manageToken,
    };
  },

  /**
   * Agendamento pela equipe (telefone/balcão) ou encaixe.
   * Pode marcar fora da grade (a equipe decide), mas nunca sobrepor outro atendimento.
   */
  async createByStaff(auth: AuthContext, data: StaffBookingInput) {
    if (auth.role === 'BARBER' && data.barberId !== auth.membershipId) {
      throw new HttpError(403, 'Barbeiro só agenda na própria agenda', 'FORBIDDEN');
    }
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } });
    const walkIn = data.walkIn === true;
    const now = new Date();
    now.setSeconds(0, 0);
    const startAt = walkIn ? now : zonedToUtc(data.date!, data.time!, tenant.timezone);

    const { booking } = await insertBooking({
      tenant,
      ...data,
      startAt,
      source: walkIn ? 'WALK_IN' : 'PANEL',
      status: 'CONFIRMED',
    });
    return booking;
  },

  async findAll(auth: AuthContext, f: BookingFiltersInput) {
    const where: Prisma.BookingWhereInput = { tenantId: auth.tenantId };
    if (auth.role === 'BARBER') where.barberId = auth.membershipId; // barbeiro só vê os próprios
    else if (f.barberId) where.barberId = f.barberId;
    if (f.status) where.status = f.status;
    if (f.date) {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } });
      const { start, end } = dayRangeUtc(f.date, tenant.timezone);
      where.startAt = { gte: start, lt: end };
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: listInclude,
        orderBy: { startAt: 'asc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      prisma.booking.count({ where }),
    ]);
    return { bookings, total, page: f.page, pageSize: f.pageSize };
  },

  async findById(auth: AuthContext, id: string) {
    const booking = await prisma.booking.findFirst({
      where: { id, tenantId: auth.tenantId, ...(auth.role === 'BARBER' ? { barberId: auth.membershipId } : {}) },
      include: { ...listInclude, notifications: true },
    });
    if (!booking) throw new HttpError(404, 'Agendamento não encontrado', 'NOT_FOUND');
    return booking;
  },

  /** Mudança de status pela equipe. Atualização condicional evita corrida entre dois cliques/usuários. */
  async updateStatus(auth: AuthContext, id: string, status: BookingStatus) {
    const booking = await this.findById(auth, id);
    if (!TRANSITIONS[booking.status].includes(status)) {
      throw new HttpError(400, `Não é possível alterar de ${booking.status} para ${status}`, 'INVALID_TRANSITION');
    }

    return prisma.$transaction(async (tx) => {
      if (status === 'COMPLETED') {
        await completeBooking(tx, booking, auth.tenantId);
      } else {
        const { count } = await tx.booking.updateMany({ where: { id, status: booking.status }, data: { status } });
        if (count === 0) throw new HttpError(409, 'O agendamento foi alterado por outra pessoa. Recarregue.', 'STALE');
      }

      if (status === 'CANCELLED') {
        await tx.notification.create({ data: { bookingId: id, type: 'CANCELLATION' } });
      }

      return tx.booking.findUniqueOrThrow({ where: { id }, include: listInclude });
    });
  },

  /** Remarcar (pela equipe): novo horário e/ou barbeiro. Mantém preço e duração da reserva. */
  async reschedule(auth: AuthContext, id: string, data: RescheduleInput) {
    const booking = await this.findById(auth, id);
    if (!ACTIVE.includes(booking.status)) throw new HttpError(400, 'Só é possível remarcar agendamentos em aberto', 'INVALID_TRANSITION');

    const barberId = data.barberId ?? booking.barberId;
    if (auth.role === 'BARBER' && barberId !== auth.membershipId) {
      throw new HttpError(403, 'Barbeiro só remarca na própria agenda', 'FORBIDDEN');
    }
    if (barberId !== booking.barberId) await getBarberAndService(auth.tenantId, barberId, booking.serviceId);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } });
    const startAt = zonedToUtc(data.date, data.time, tenant.timezone);
    try {
      return await prisma.booking.update({
        where: { id },
        data: { barberId, startAt, endAt: addMinutes(startAt, booking.durationMinutes) },
        include: listInclude,
      });
    } catch (e) {
      if (isOverlapError(e)) throw slotTaken();
      throw e;
    }
  },

  // ===== Link "gerenciar agendamento" do cliente (sem login) =====

  async findByManageToken(tenant: Tenant, token: string) {
    const booking = await prisma.booking.findFirst({
      where: { tenantId: tenant.id, manageTokenHash: sha256(token) },
      include: { barber: { select: { user: { select: { name: true } } } }, service: { select: { name: true } } },
    });
    if (!booking) throw new HttpError(404, 'Agendamento não encontrado', 'NOT_FOUND');
    const hoursLeft = (booking.startAt.getTime() - Date.now()) / 3_600_000;
    return {
      booking,
      view: {
        status: booking.status,
        startAt: booking.startAt,
        ...utcToZoned(booking.startAt, tenant.timezone),
        service: booking.service.name,
        barber: booking.barber.user.name,
        priceCents: booking.priceCents,
        canCancel: ACTIVE.includes(booking.status) && hoursLeft >= tenant.clientCancelMinHours,
        cancelMinHours: tenant.clientCancelMinHours,
      },
    };
  },

  async cancelByClient(tenant: Tenant, token: string) {
    const { booking, view } = await this.findByManageToken(tenant, token);
    if (!view.canCancel) {
      throw new HttpError(
        400,
        ACTIVE.includes(booking.status)
          ? `Cancelamento pelo link só até ${tenant.clientCancelMinHours}h antes. Fale com a barbearia.`
          : 'Este agendamento não pode mais ser cancelado.',
        'CANCEL_NOT_ALLOWED',
      );
    }
    await prisma.$transaction([
      prisma.booking.updateMany({ where: { id: booking.id, status: { in: ACTIVE } }, data: { status: 'CANCELLED' } }),
      prisma.notification.create({ data: { bookingId: booking.id, type: 'CANCELLATION' } }),
    ]);
    return { ...view, status: 'CANCELLED' as const, canCancel: false };
  },
};
