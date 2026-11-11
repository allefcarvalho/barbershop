import { z } from 'zod';

const role = z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER']);

export const createBarberSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
  phone: z.string().min(8).max(30).optional(),
  avatarUrl: z.string().url().optional(),
  role: role.default('BARBER'),
  serviceIds: z.array(z.string().uuid()).optional(),
});

export const updateBarberSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().min(8).max(30).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
  role: role.optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
});

export type CreateBarberInput = z.infer<typeof createBarberSchema>;
export type UpdateBarberInput = z.infer<typeof updateBarberSchema>;
