import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import type { CreateServiceInput, UpdateServiceInput } from './service.schema';

async function get(tenantId: string, id: string) {
  const s = await prisma.service.findFirst({ where: { id, tenantId } });
  if (!s) throw new HttpError(404, 'Serviço não encontrado', 'NOT_FOUND');
  return s;
}

export const serviceService = {
  list: (tenantId: string, activeOnly: boolean) =>
    prisma.service.findMany({ where: { tenantId, ...(activeOnly ? { active: true } : {}) }, orderBy: { sortOrder: 'asc' } }),

  get,

  create: (tenantId: string, data: CreateServiceInput) => prisma.service.create({ data: { ...data, tenantId } }),

  async update(tenantId: string, id: string, data: UpdateServiceInput) {
    await get(tenantId, id);
    return prisma.service.update({ where: { id }, data });
  },
};
