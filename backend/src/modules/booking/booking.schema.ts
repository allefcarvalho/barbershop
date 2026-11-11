import { z } from 'zod';
import { phoneSchema } from '../../utils/phone';
import { DATE_RE, TIME_RE } from '../../utils/time';

const STATUS = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;
const date = z.string().regex(DATE_RE, 'Formato: YYYY-MM-DD');
const time = z.string().regex(TIME_RE, 'Formato: HH:mm');

const clientFields = {
  clientName: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  clientPhone: phoneSchema,
  clientEmail: z.string().email('E-mail inválido').max(200).optional(),
  barberId: z.string().uuid('Barbeiro inválido'),
  serviceId: z.string().uuid('Serviço inválido'),
  notes: z.string().trim().max(500).optional(),
};

/** Agendamento público. Data e hora no fuso da barbearia; a conversão para UTC é feita no servidor. */
export const createBookingSchema = z.object({
  ...clientFields,
  date,
  time,
  // LGPD: o cliente precisa aceitar a política de privacidade para agendar.
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar a política de privacidade' }) }),
});

/** Agendamento pela equipe. Encaixe (walkIn) começa agora e dispensa data/hora. */
export const staffBookingSchema = z
  .object({ ...clientFields, date: date.optional(), time: time.optional(), walkIn: z.boolean().optional() })
  .refine((b) => b.walkIn || (b.date && b.time), 'Informe data e hora');

export const rescheduleSchema = z.object({ date, time, barberId: z.string().uuid().optional() });

export const updateBookingStatusSchema = z.object({ status: z.enum(STATUS) });

export const bookingFiltersSchema = z.object({
  barberId: z.string().uuid().optional(),
  date: date.optional(),
  status: z.enum(STATUS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type StaffBookingInput = z.infer<typeof staffBookingSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type BookingFiltersInput = z.infer<typeof bookingFiltersSchema>;
