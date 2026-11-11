import { z } from 'zod';

export const notificationFiltersSchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'SKIPPED']).optional(),
  channel: z.enum(['INTERNAL', 'WHATSAPP', 'SMS']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type NotificationFiltersInput = z.infer<typeof notificationFiltersSchema>;
