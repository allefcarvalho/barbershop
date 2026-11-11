import { Tenant } from '@prisma/client';
import { prisma } from '../../config/database';
import { HttpError } from '../../utils/apiResponse';
import { utcToZoned } from '../../utils/time';
import { cancelBooking } from '../booking/booking.service';
import { enqueue } from './queue';
import { parseReply } from './messages';
import type { NotificationFiltersInput } from './notification.schema';

export const notificationService = {
  async list(tenantId: string, f: NotificationFiltersInput) {
    const where = { tenantId, ...(f.status ? { status: f.status } : {}), ...(f.channel ? { channel: f.channel } : {}) };
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        select: {
          id: true, type: true, status: true, channel: true, scheduledFor: true, sentAt: true, attempts: true, lastError: true, createdAt: true,
          client: { select: { name: true, phone: true } },
          booking: { select: { startAt: true, service: { select: { name: true } } } },
        },
        orderBy: { scheduledFor: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total, page: f.page, pageSize: f.pageSize };
  },

  /** Reenviar uma mensagem que falhou ou foi pulada (ex.: depois de configurar o WhatsApp). */
  async retry(tenantId: string, id: string) {
    const { count } = await prisma.notification.updateMany({
      where: { id, tenantId, status: { in: ['FAILED', 'SKIPPED'] } },
      data: { status: 'PENDING', scheduledFor: new Date(), attempts: 0, lastError: null },
    });
    if (count === 0) throw new HttpError(404, 'Mensagem não encontrada ou já enviada', 'NOT_FOUND');
  },

  /**
   * Resposta do cliente no WhatsApp: "1" confirma presença, "2" cancela o próximo horário
   * (respeitando o prazo da barbearia), "SAIR" para de receber mensagens.
   */
  async handleIncoming(tenant: Tenant, phoneE164: string, text: string) {
    const action = parseReply(text);
    if (!action) return null;
    const client = await prisma.client.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone: phoneE164 } } });
    if (!client) return null;

    if (action === 'OPT_OUT') {
      await prisma.client.update({ where: { id: client.id }, data: { whatsappOptOutAt: new Date() } });
      return action;
    }

    const reply = (msg: string) => enqueue(prisma, { tenantId: tenant.id, clientId: client.id, type: 'MESSAGE', payload: { text: msg } });
    const booking = await prisma.booking.findFirst({
      where: { clientId: client.id, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gt: new Date() } },
      orderBy: { startAt: 'asc' },
    });
    if (!booking) {
      await reply('Você não tem horários em aberto. Para agendar, acesse nosso site.');
      return action;
    }
    const when = utcToZoned(booking.startAt, tenant.timezone);
    const day = when.date.split('-').reverse().slice(0, 2).join('/');

    if (action === 'CONFIRM') {
      // Confirmação de presença. Se ainda depende da barbearia (PENDING), o cliente não pode aprovar sozinho.
      await reply(
        booking.status === 'PENDING'
          ? `Recebido! A barbearia ainda vai confirmar seu horário de ${day} às ${when.time}.`
          : `Presença confirmada! Te esperamos em ${day} às ${when.time}.`,
      );
      return action;
    }

    const hoursLeft = (booking.startAt.getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < tenant.clientCancelMinHours) {
      await reply(`Pelo WhatsApp o cancelamento vai até ${tenant.clientCancelMinHours}h antes do horário. Por favor, fale com a barbearia.`);
      return action;
    }
    await prisma.$transaction((tx) => cancelBooking(tx, booking)); // a própria fila manda a confirmação do cancelamento
    return action;
  },
};
