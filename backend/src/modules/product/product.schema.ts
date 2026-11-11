import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(500),
  priceCents: z.number().int().min(0),
  stockMin: z.number().int().min(0).default(5),
  imageUrl: z.string().url().optional(),
});

// Estoque não é editável aqui: só muda por movimentação (RN12).
export const updateProductSchema = createProductSchema.partial().extend({
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
});

export const stockMovementSchema = z.object({
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number().int().min(0).max(100_000),
  reason: z.string().max(200).optional(),
}).refine((m) => m.type === 'ADJUSTMENT' || m.quantity > 0, 'Quantidade deve ser positiva');

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
