import { z } from 'zod';
import { DATE_RE, TIME_RE } from '../../utils/time';

const time = z.string().regex(TIME_RE, 'Formato: HH:mm');
const date = z.string().regex(DATE_RE, 'Formato: YYYY-MM-DD');
const startBeforeEnd = (v: { startTime?: string; endTime?: string }) => !v.startTime || !v.endTime || v.startTime < v.endTime;

export const setAvailabilitySchema = z.object({
  schedules: z
    .array(
      z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time, active: z.boolean().default(true) })
        .refine(startBeforeEnd, 'Início deve ser antes do fim'),
    )
    .min(1, 'Informe ao menos um dia')
    .refine((s) => new Set(s.map((d) => d.dayOfWeek)).size === s.length, 'Dia da semana repetido'),
});

export const createExceptionSchema = z
  .object({ date, isBlocked: z.boolean().default(true), startTime: time.optional(), endTime: time.optional(), reason: z.string().max(200).optional() })
  .refine(startBeforeEnd, 'Início deve ser antes do fim')
  .refine((v) => v.isBlocked || (v.startTime && v.endTime), 'Horário especial precisa de início e fim');

export const slotsQuerySchema = z.object({ date, serviceId: z.string().uuid() });

export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;
