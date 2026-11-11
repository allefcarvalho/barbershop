import { NotificationChannel } from '@prisma/client';
import { prisma } from '../../config/database';
import type { NotificationFiltersInput } from './notification.schema';

type Sender = (payload: string) => Promise<void>;

// Canal interno só registra. WhatsApp entra aqui na Fase 3 (worker + Cloud API + webhook assinado).
const senders: Partial<Record<NotificationChannel, Sender>> = {
  INTERNAL: async (payload) => console.log('[NOTIFICATION:INTERNAL]', payload),
};

export const notificationService = {
  async list(tenantId: string, f: NotificationFiltersInput) {
    const where = {
      booking: { tenantId },
      ...(f.status ? { status: f.status } : {}),
      ...(f.channel ? { channel: f.channel } : {}),
    };
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { booking: { select: { id: true, startAt: true, client: { select: { name: true } }, service: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total, page: f.page, pageSize: f.pageSize };
  },

  // ponytail: processamento manual e por tenant; vira worker BullMQ com retentativas na Fase 3.
  async processPending(tenantId: string) {
    const pending = await prisma.notification.findMany({ where: { status: 'PENDING', booking: { tenantId } }, take: 50 });
    let sent = 0;
    for (const n of pending) {
      const send = senders[n.channel];
      if (!send) continue;
      try {
        await send(n.payload ?? '');
        await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date() } });
        sent++;
      } catch {
        await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED' } });
      }
    }
    return { sent, total: pending.length };
  },
};
