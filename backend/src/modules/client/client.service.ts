import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import type { AuthContext } from '../../middlewares/auth.middleware';
import type { UpdateClientInput, ClientFiltersInput } from './client.schema';

/** Escopo de visibilidade: barbeiro só enxerga clientes que já atendeu/vai atender. */
function scope(auth: AuthContext): Prisma.ClientWhereInput {
  return {
    tenantId: auth.tenantId,
    ...(auth.role === 'BARBER' ? { bookings: { some: { barberId: auth.membershipId } } } : {}),
  };
}

export const clientService = {
  async list(auth: AuthContext, f: ClientFiltersInput) {
    const where: Prisma.ClientWhereInput = { ...scope(auth) };
    if (f.search) {
      const digits = f.search.replace(/\D/g, '');
      where.OR = [
        { name: { contains: f.search, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        { email: { contains: f.search, mode: 'insensitive' } },
      ];
    }
    if (f.recurring !== undefined) where.isRecurring = f.recurring;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      prisma.client.count({ where }),
    ]);
    return { clients, total, page: f.page, pageSize: f.pageSize };
  },

  async get(auth: AuthContext, id: string) {
    const client = await prisma.client.findFirst({
      where: { id, ...scope(auth) },
      include: {
        bookings: {
          where: auth.role === 'BARBER' ? { barberId: auth.membershipId } : {},
          include: { barber: { select: { id: true, user: { select: { name: true } } } }, service: { select: { id: true, name: true } } },
          orderBy: { startAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!client) throw new HttpError(404, 'Cliente não encontrado', 'NOT_FOUND');
    return client;
  },

  async update(auth: AuthContext, id: string, data: UpdateClientInput) {
    await this.get(auth, id);
    return prisma.client.update({ where: { id }, data });
  },

  /**
   * LGPD: pedido de exclusão. Apaga os dados pessoais e mantém os atendimentos
   * (sem identificar ninguém) para relatórios e obrigações fiscais.
   */
  async anonymize(auth: AuthContext, id: string) {
    await this.get(auth, id);
    return prisma.client.update({
      where: { id },
      data: { name: 'Cliente removido', phone: `anon:${id}`, email: null, notes: null, consentAt: null },
    });
  },
};
