import { z } from 'zod';
import { phoneSchema } from '../../utils/phone';

export const updateClientSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema.optional(),
  email: z.string().email().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const clientFiltersSchema = z.object({
  search: z.string().trim().max(100).optional(),
  recurring: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientFiltersInput = z.infer<typeof clientFiltersSchema>;
