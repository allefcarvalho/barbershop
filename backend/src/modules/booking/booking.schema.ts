import { z } from 'zod';
import { phoneSchema } from '../../utils/phone';
import { DATE_RE, TIME_RE } from '../../utils/time';

const STATUS = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;

export const createBookingSchema = z.object({
  clientName: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  clientPhone: phoneSchema,
  clientEmail: z.string().email().max(200).optional(),
  barberId: z.string().uuid('Barbeiro inválido'),
  serviceId: z.string().uuid('Serviço inválido'),
  // Data e hora no fuso da barbearia; a conversão para UTC é feita no servidor.
  date: z.string().regex(DATE_RE, 'Formato: YYYY-MM-DD'),
  time: z.string().regex(TIME_RE, 'Formato: HH:mm'),
  notes: z.string().max(500).optional(),
});

export const updateBookingStatusSchema = z.object({ status: z.enum(STATUS) });

export const bookingFiltersSchema = z.object({
  barberId: z.string().uuid().optional(),
  date: z.string().regex(DATE_RE).optional(),
  status: z.enum(STATUS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingFiltersInput = z.infer<typeof bookingFiltersSchema>;
