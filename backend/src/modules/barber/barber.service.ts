import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import { getBarber } from '../availability/availability.service';
import type { CreateBarberInput, UpdateBarberInput } from './barber.schema';

/** Campos seguros para a página pública: sem e-mail nem telefone da equipe. */
const publicSelect = {
  id: true,
  user: { select: { name: true, avatarUrl: true } },
  services: { select: { serviceId: true } },
} satisfies Prisma.MembershipSelect;

const staffSelect = {
  id: true,
  role: true,
  serviceCommissionPct: true,
  productCommissionPct: true,
  active: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
  services: { select: { service: { select: { id: true, name: true } } } },
} satisfies Prisma.MembershipSelect;

async function assertServicesInTenant(tx: Prisma.TransactionClient, tenantId: string, serviceIds: string[]) {
  const n = await tx.service.count({ where: { tenantId, id: { in: serviceIds } } });
  if (n !== new Set(serviceIds).size) throw new HttpError(400, 'Serviço inválido', 'INVALID_SERVICE');
}

export const barberService = {
  async listPublic(tenantId: string, serviceId?: string) {
    const rows = await prisma.membership.findMany({
      where: {
        tenantId,
        active: true,
        user: { active: true },
        services: serviceId ? { some: { serviceId, service: { active: true } } } : { some: {} },
      },
      select: publicSelect,
      orderBy: { user: { name: 'asc' } },
    });
    return rows.map((m) => ({ id: m.id, name: m.user.name, avatarUrl: m.user.avatarUrl, serviceIds: m.services.map((s) => s.serviceId) }));
  },

  async list(tenantId: string) {
    return prisma.membership.findMany({ where: { tenantId }, select: staffSelect, orderBy: { user: { name: 'asc' } } });
  },

  async findById(tenantId: string, id: string) {
    await getBarber(tenantId, id);
    return prisma.membership.findUniqueOrThrow({ where: { id }, select: staffSelect });
  },

  async create(tenantId: string, data: CreateBarberInput) {
    const email = data.email.toLowerCase();
    // ponytail: e-mail já cadastrado (ex.: em outra barbearia) exige o fluxo de convite (Fase 1), para não vincular conta alheia.
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, 'E-mail já cadastrado. Use o convite de equipe.', 'EMAIL_IN_USE');
    }
    const passwordHash = await bcrypt.hash(data.password, 12);

    const id = await prisma.$transaction(async (tx) => {
      if (data.serviceIds?.length) await assertServicesInTenant(tx, tenantId, data.serviceIds);
      const user = await tx.user.create({ data: { name: data.name, email, passwordHash, phone: data.phone, avatarUrl: data.avatarUrl } });
      const m = await tx.membership.create({
        data: { tenantId, userId: user.id, role: data.role, serviceCommissionPct: data.serviceCommissionPct, productCommissionPct: data.productCommissionPct },
      });
      if (data.serviceIds?.length) {
        await tx.barberService.createMany({ data: data.serviceIds.map((serviceId) => ({ membershipId: m.id, serviceId })) });
      }
      return m.id;
    });
    return this.findById(tenantId, id);
  },

  /** `managed` = quem chama é dono/gerente; o próprio barbeiro só altera o perfil. */
  async update(tenantId: string, id: string, data: UpdateBarberInput, managed: boolean) {
    const m = await getBarber(tenantId, id);
    if (!managed && (data.active !== undefined || data.serviceIds !== undefined || data.role !== undefined || data.serviceCommissionPct !== undefined || data.productCommissionPct !== undefined)) {
      throw new HttpError(403, 'Somente o dono ou gerente altera serviços, papel, comissão e status', 'FORBIDDEN');
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: m.userId }, data: { name: data.name, phone: data.phone, avatarUrl: data.avatarUrl } });
      await tx.membership.update({
        where: { id },
        data: { active: data.active, role: data.role, serviceCommissionPct: data.serviceCommissionPct, productCommissionPct: data.productCommissionPct },
      });

      if (data.serviceIds) {
        await assertServicesInTenant(tx, tenantId, data.serviceIds);
        await tx.barberService.deleteMany({ where: { membershipId: id } });
        await tx.barberService.createMany({ data: data.serviceIds.map((serviceId) => ({ membershipId: id, serviceId })) });
      }

      if (data.active === false) {
        // Desligado: cancela os agendamentos futuros e encerra as sessões.
        await tx.booking.updateMany({
          where: { barberId: id, startAt: { gt: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
          data: { status: 'CANCELLED' },
        });
        await tx.refreshToken.updateMany({ where: { membershipId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    });
    return this.findById(tenantId, id);
  },
};
