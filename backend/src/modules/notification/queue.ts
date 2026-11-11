import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { addMinutes, utcToZoned } from '../../utils/time';
import { renderMessage } from './messages';
import { sendWhatsApp } from './whatsapp';

type Db = Prisma.TransactionClient | typeof prisma;

/** Coloca uma mensagem na fila. Use dentro da mesma transação da mudança que a gerou. */
export function enqueue(
  db: Db,
  n: { tenantId: string; clientId: string; bookingId?: string; type: NotificationType; scheduledFor?: Date; payload?: Prisma.InputJsonValue },
) {
  return db.notification.create({ data: n });
}

/** Lembrete X horas antes. Não agenda se já estaria "atrasado" (cliente acabou de marcar em cima da hora). */
export function enqueueReminder(db: Db, tenant: { id: string; reminderHours: number }, booking: { id: string; clientId: string; startAt: Date }) {
  if (tenant.reminderHours <= 0) return;
  const at = addMinutes(booking.startAt, -tenant.reminderHours * 60);
  if (at < addMinutes(new Date(), 10)) return;
  return enqueue(db, {
    tenantId: tenant.id,
    clientId: booking.clientId,
    bookingId: booking.id,
    type: 'REMINDER',
    scheduledFor: at,
    // Se o agendamento for remarcado, este lembrete fica velho e é descartado no envio.
    payload: { startAt: booking.startAt.toISOString() },
  });
}

const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 5;

/** Espera entre tentativas: 1, 2, 4, 8 min… */
const backoff = (attempts: number) => 2 ** Math.max(0, attempts - 1);

type Outcome = { status: 'SENT'; externalId?: string; channel: 'WHATSAPP' | 'INTERNAL' } | { status: 'SKIPPED'; reason: string };

async function deliver(id: string): Promise<Outcome> {
  const n = await prisma.notification.findUniqueOrThrow({
    where: { id },
    include: {
      tenant: true,
      client: true,
      booking: { include: { service: { select: { name: true } }, barber: { select: { user: { select: { name: true } } } } } },
    },
  });
  const { tenant, client, booking } = n;
  const payload = (n.payload ?? {}) as Record<string, string>;

  // Só manda para quem aceitou e não pediu para sair (LGPD).
  if (!client.consentAt) return { status: 'SKIPPED', reason: 'Cliente sem consentimento para mensagens' };
  if (client.whatsappOptOutAt) return { status: 'SKIPPED', reason: 'Cliente pediu para não receber mensagens' };
  if (client.phone.startsWith('anon:')) return { status: 'SKIPPED', reason: 'Dados do cliente removidos' };

  if (booking) {
    const active = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
    if ((n.type === 'REMINDER' || n.type === 'CONFIRMATION') && !active) return { status: 'SKIPPED', reason: 'Agendamento não está mais em aberto' };
    if (n.type === 'REMINDER' && payload.startAt !== booking.startAt.toISOString()) return { status: 'SKIPPED', reason: 'Agendamento foi remarcado' };
  }

  const when = booking ? utcToZoned(booking.startAt, tenant.timezone) : null;
  const msg = renderMessage({
    type: n.type,
    clientName: client.name,
    tenantName: tenant.name,
    service: booking?.service.name ?? payload.service,
    barber: booking?.barber.user.name,
    date: (when?.date ?? payload.date ?? '').split('-').reverse().slice(0, 2).join('/'),
    time: when?.time,
    pending: booking?.status === 'PENDING',
    link: payload.manageToken ? `${env.PUBLIC_APP_URL}/agendamento#${payload.manageToken}` : payload.link,
    text: payload.text,
  });

  if (env.WHATSAPP_TOKEN && tenant.whatsappPhoneNumberId) {
    const externalId = await sendWhatsApp(tenant.whatsappPhoneNumberId, client.phone, msg);
    return { status: 'SENT', externalId, channel: 'WHATSAPP' };
  }
  // Log sem o token do link (log de servidor não é lugar de credencial) e sem o telefone completo.
  const safe = msg.text.replace(/(agendamento#)[\w-]+/, '$1***');
  console.log(`[MENSAGEM:INTERNA] ${tenant.slug} → ${client.phone.slice(0, -4)}****: ${safe}`);
  return { status: 'SENT', channel: 'INTERNAL' };
}

/**
 * Processa o que está vencido na fila. Seguro com vários workers ao mesmo tempo:
 * cada um "reserva" linhas com FOR UPDATE SKIP LOCKED e empurra scheduled_for (lease);
 * se o processo cair no meio, a mensagem volta para a fila sozinha depois do lease.
 */
export async function processDue(limit = 50) {
  const claimed = await prisma.$queryRaw<{ id: string; attempts: number }[]>`
    UPDATE notifications SET attempts = attempts + 1, scheduled_for = now() + ${LEASE_MINUTES}::int * interval '1 minute'
    WHERE id IN (
      SELECT id FROM notifications
      WHERE status = 'PENDING' AND scheduled_for <= now()
      ORDER BY scheduled_for
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, attempts`;

  let sent = 0;
  for (const { id, attempts } of claimed) {
    try {
      const out = await deliver(id);
      if (out.status === 'SENT') {
        sent++;
        await prisma.notification.update({
          where: { id },
          // O link com token só fica no banco até ser enviado.
          data: { status: 'SENT', sentAt: new Date(), channel: out.channel, externalId: out.externalId, lastError: null, payload: Prisma.DbNull },
        });
      } else {
        await prisma.notification.update({ where: { id }, data: { status: 'SKIPPED', lastError: out.reason, payload: Prisma.DbNull } });
      }
    } catch (e) {
      const error = (e as Error).message.slice(0, 500);
      await prisma.notification.update({
        where: { id },
        data:
          attempts >= MAX_ATTEMPTS
            ? { status: 'FAILED', lastError: error }
            : { lastError: error, scheduledFor: addMinutes(new Date(), backoff(attempts)) },
      });
    }
  }
  return { claimed: claimed.length, sent };
}
