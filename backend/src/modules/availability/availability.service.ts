import { Tenant } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import { addDays, addMinutes, computeSlots, dayOfWeek, dayRangeUtc, utcToZoned, zonedToUtc } from '../../utils/time';
import type { SetAvailabilityInput, CreateExceptionInput } from './availability.schema';

/** Garante que o barbeiro (membership) pertence ao tenant; senão 404 (não revela que existe em outro). */
export async function getBarber(tenantId: string, barberId: string) {
  const m = await prisma.membership.findFirst({ where: { id: barberId, tenantId } });
  if (!m) throw new HttpError(404, 'Barbeiro não encontrado', 'BARBER_NOT_FOUND');
  return m;
}

export const availabilityService = {
  async getSchedule(tenantId: string, barberId: string) {
    await getBarber(tenantId, barberId);
    return prisma.availability.findMany({ where: { membershipId: barberId }, orderBy: { dayOfWeek: 'asc' } });
  },

  async setSchedule(tenantId: string, barberId: string, data: SetAvailabilityInput) {
    await getBarber(tenantId, barberId);
    return prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({ where: { membershipId: barberId } });
      await tx.availability.createMany({ data: data.schedules.map((s) => ({ ...s, membershipId: barberId })) });
      return tx.availability.findMany({ where: { membershipId: barberId }, orderBy: { dayOfWeek: 'asc' } });
    });
  },

  async getExceptions(tenantId: string, barberId: string) {
    await getBarber(tenantId, barberId);
    return prisma.availabilityException.findMany({
      where: { membershipId: barberId, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      orderBy: { date: 'asc' },
    });
  },

  async upsertException(tenantId: string, barberId: string, data: CreateExceptionInput) {
    await getBarber(tenantId, barberId);
    const date = new Date(data.date); // coluna DATE: só o dia de calendário importa
    const fields = { isBlocked: data.isBlocked, startTime: data.startTime, endTime: data.endTime, reason: data.reason };
    return prisma.availabilityException.upsert({
      where: { membershipId_date: { membershipId: barberId, date } },
      update: fields,
      create: { membershipId: barberId, date, ...fields },
    });
  },

  async deleteException(tenantId: string, barberId: string, exceptionId: string) {
    await getBarber(tenantId, barberId);
    const { count } = await prisma.availabilityException.deleteMany({ where: { id: exceptionId, membershipId: barberId } });
    if (count === 0) throw new HttpError(404, 'Exceção não encontrada', 'NOT_FOUND');
  },

  /**
   * Motor de disponibilidade: horários de início em que o serviço inteiro cabe.
   * É a única fonte da verdade — a criação de agendamento revalida contra ela.
   */
  async getSlots(tenant: Tenant, barberId: string, date: string, serviceId: string): Promise<string[]> {
    const [barber, service] = await Promise.all([
      prisma.membership.findFirst({
        where: { id: barberId, tenantId: tenant.id, active: true, user: { active: true }, services: { some: { serviceId } } },
      }),
      prisma.service.findFirst({ where: { id: serviceId, tenantId: tenant.id, active: true } }),
    ]);
    if (!service) throw new HttpError(404, 'Serviço não encontrado', 'SERVICE_NOT_FOUND');
    if (!barber) throw new HttpError(404, 'Barbeiro não encontrado ou não faz este serviço', 'BARBER_NOT_FOUND');

    const now = new Date();
    const today = utcToZoned(now, tenant.timezone).date;
    if (date < today || date > addDays(today, tenant.maxAdvanceDays)) return [];

    const [schedule, exception] = await Promise.all([
      prisma.availability.findUnique({ where: { membershipId_dayOfWeek: { membershipId: barberId, dayOfWeek: dayOfWeek(date) } } }),
      prisma.availabilityException.findUnique({ where: { membershipId_date: { membershipId: barberId, date: new Date(date) } } }),
    ]);

    let workStart = schedule?.active ? schedule.startTime : null;
    let workEnd = schedule?.active ? schedule.endTime : null;
    const busy: { start: Date; end: Date }[] = [];

    if (exception) {
      if (!exception.isBlocked && exception.startTime && exception.endTime) {
        workStart = exception.startTime; // horário especial (pode abrir um dia normalmente fechado)
        workEnd = exception.endTime;
      } else if (exception.isBlocked && exception.startTime && exception.endTime) {
        busy.push({
          start: zonedToUtc(date, exception.startTime, tenant.timezone),
          end: zonedToUtc(date, exception.endTime, tenant.timezone),
        });
      } else if (exception.isBlocked) {
        return [];
      }
    }
    if (!workStart || !workEnd) return [];

    const { start, end } = dayRangeUtc(date, tenant.timezone);
    const bookings = await prisma.booking.findMany({
      where: { barberId, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { lt: end }, endAt: { gt: start } },
      select: { startAt: true, endAt: true },
    });
    busy.push(...bookings.map((b) => ({ start: b.startAt, end: b.endAt })));

    return computeSlots({
      date,
      tz: tenant.timezone,
      workStart,
      workEnd,
      stepMinutes: tenant.slotStepMinutes,
      durationMinutes: service.durationMinutes,
      busy,
      notBefore: addMinutes(now, tenant.minAdvanceMinutes),
    });
  },
};
