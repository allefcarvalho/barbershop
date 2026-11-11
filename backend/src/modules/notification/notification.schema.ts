import { z } from 'zod';

export const notificationFiltersSchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
  channel: z.enum(['INTERNAL', 'WHATSAPP', 'SMS']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationFiltersInput = z.infer<typeof notificationFiltersSchema>;
