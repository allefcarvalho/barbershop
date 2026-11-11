import { z } from 'zod';

export const createServiceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(500),
  priceCents: z.number().int().min(0, 'Preço inválido'),
  durationMinutes: z.number().int().min(5).max(480),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateServiceSchema = createServiceSchema.partial().extend({ active: z.boolean().optional() });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
