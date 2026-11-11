import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import type { AuthContext } from '../../middlewares/auth.middleware';
import type { CreateProductInput, UpdateProductInput, StockMovementInput } from './product.schema';

async function get(tenantId: string, id: string) {
  const p = await prisma.product.findFirst({ where: { id, tenantId } });
  if (!p) throw new HttpError(404, 'Produto não encontrado', 'NOT_FOUND');
  return p;
}

export const productService = {
  listPublic: (tenantId: string) =>
    prisma.product.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, description: true, priceCents: true, imageUrl: true },
      orderBy: { name: 'asc' },
    }),

  list: (tenantId: string) => prisma.product.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),

  get,

  create: (tenantId: string, data: CreateProductInput) => prisma.product.create({ data: { ...data, tenantId } }),

  async update(tenantId: string, id: string, data: UpdateProductInput) {
    await get(tenantId, id);
    return prisma.product.update({ where: { id }, data });
  },

  /**
   * Movimentação atômica: o estoque é alterado numa única instrução SQL,
   * então duas saídas simultâneas não deixam o saldo negativo (CHECK no banco é a última barreira).
   */
  async addStockMovement(auth: AuthContext, productId: string, m: StockMovementInput) {
    await get(auth.tenantId, productId);

    return prisma.$transaction(async (tx) => {
      if (m.type === 'IN') {
        await tx.product.update({ where: { id: productId }, data: { stockQuantity: { increment: m.quantity } } });
      } else if (m.type === 'OUT') {
        const { count } = await tx.product.updateMany({
          where: { id: productId, stockQuantity: { gte: m.quantity } },
          data: { stockQuantity: { decrement: m.quantity } },
        });
        if (count === 0) throw new HttpError(400, 'Estoque insuficiente', 'INSUFFICIENT_STOCK');
      } else {
        await tx.product.update({ where: { id: productId }, data: { stockQuantity: m.quantity } });
      }

      return tx.stockMovement.create({
        data: { productId, membershipId: auth.membershipId, type: m.type, quantity: m.quantity, reason: m.reason },
      });
    });
  },

  async stockHistory(tenantId: string, productId: string) {
    await get(tenantId, productId);
    return prisma.stockMovement.findMany({
      where: { productId },
      include: { membership: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  lowStock: (tenantId: string) =>
    prisma.$queryRaw`
      SELECT id, name, stock_quantity AS "stockQuantity", stock_min AS "stockMin"
      FROM products
      WHERE tenant_id = ${tenantId} AND active = true AND stock_quantity <= stock_min
      ORDER BY stock_quantity ASC`,
};
