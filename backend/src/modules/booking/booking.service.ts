import { BookingStatus, Prisma, Tenant } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import { addMinutes, dayRangeUtc, zonedToUtc } from '../../utils/time';
import { availabilityService } from '../availability/availability.service';
import type { AuthContext } from '../../middlewares/auth.middleware';
import type { CreateBookingInput, BookingFiltersInput } from './booking.schema';

const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

const slotTaken = () => new HttpError(409, 'Este horário acabou de ser reservado. Escolha outro.', 'SLOT_TAKEN');

/** Violação da constraint EXCLUDE "bookings_no_overlap" (SQLSTATE 23P01). */
function isOverlapError(e: unknown) {
  return e instanceof Error && /bookings_no_overlap|23P01/.test(e.message);
}

const listInclude = {
  client: { select: { id: true, name: true, phone: true, isRecurring: true } },
  barber: { select: { id: true, user: { select: { name: true } } } },
  service: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

export const bookingService = {
  /**
   * Agendamento público. Duas barreiras contra double booking:
   * 1) o horário precisa estar na lista do motor de slots (jornada, bloqueios, antecedência);
   * 2) a constraint EXCLUDE no banco resolve a corrida entre requisições simultâneas.
   */
  async create(tenant: Tenant, data: CreateBookingInput) {
    const { date, time } = data;
    const startAt = zonedToUtc(date, time, tenant.timezone);

    const slots = await availabilityService.getSlots(tenant, data.barberId, date, data.serviceId);
    if (!slots.includes(time)) {
      throw new HttpError(409, 'Horário indisponível. Escolha outro.', 'SLOT_UNAVAILABLE');
    }

    const service = await prisma.service.findUniqueOrThrow({ where: { id: data.serviceId } });
    const endAt = addMinutes(startAt, service.durationMinutes);

    try {
      return await prisma.$transaction(async (tx) => {
        // RN07: telefone identifica o cliente, mas o agendamento público NÃO sobrescreve dados existentes
        // (senão qualquer um que soubesse o telefone trocaria nome/e-mail de outra pessoa).
        const client = await tx.client.upsert({
          where: { tenantId_phone: { tenantId: tenant.id, phone: data.clientPhone } },
          update: {},
          create: { tenantId: tenant.id, name: data.clientName, phone: data.clientPhone, email: data.clientEmail },
        });

        const active = await tx.booking.count({
          where: { clientId: client.id, status: { in: ACTIVE }, startAt: { gt: new Date() } },
        });
        if (active >= tenant.maxActiveBookingsPerPhone) {
          throw new HttpError(409, 'Você já tem agendamentos em aberto. Cancele um para marcar outro.', 'TOO_MANY_ACTIVE');
        }

        const booking = await tx.booking.create({
          data: {
            tenantId: tenant.id,
            clientId: client.id,
            barberId: data.barberId,
            serviceId: service.id,
            startAt,
            endAt,
            status: 'CONFIRMED',
            priceCents: service.priceCents,
            durationMinutes: service.durationMinutes,
            // Nome digitado diferente do cadastro fica registrado aqui para a equipe conferir.
            notes: client.name !== data.clientName ? [`Nome informado: ${data.clientName}`, data.notes].filter(Boolean).join(' · ') : data.notes,
          },
          include: { barber: { select: { id: true, user: { select: { name: true } } } }, service: { select: { id: true, name: true } } },
        });

        await tx.notification.create({
          data: {
            bookingId: booking.id,
            type: 'CONFIRMATION',
            payload: JSON.stringify({ bookingId: booking.id, startAt, serviceName: service.name, barberName: booking.barber.user.name }),
          },
        });

        // Resposta pública: sem dados do cadastro do cliente.
        return {
          id: booking.id,
          startAt: booking.startAt,
          endAt: booking.endAt,
          status: booking.status,
          priceCents: booking.priceCents,
          service: booking.service,
          barber: { id: booking.barber.id, name: booking.barber.user.name },
        };
      });
    } catch (e) {
      if (isOverlapError(e)) throw slotTaken();
      throw e;
    }
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
      const { count } = await tx.booking.updateMany({ where: { id, status: booking.status }, data: { status } });
      if (count === 0) throw new HttpError(409, 'O agendamento foi alterado por outra pessoa. Recarregue.', 'STALE');

      if (status === 'COMPLETED') {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } });
        const client = await tx.client.update({
          where: { id: booking.clientId },
          data: { totalBookings: { increment: 1 }, lastVisit: booking.startAt },
        });
        if (!client.isRecurring && client.totalBookings >= tenant.recurringThreshold) {
          await tx.client.update({ where: { id: client.id }, data: { isRecurring: true } });
        }
      }

      if (status === 'CANCELLED') {
        await tx.notification.create({ data: { bookingId: id, type: 'CANCELLATION' } });
      }

      return tx.booking.findUniqueOrThrow({ where: { id }, include: listInclude });
    });
  },
};
