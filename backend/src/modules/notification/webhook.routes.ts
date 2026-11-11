import { Router, Request } from 'express';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { validSignature } from './whatsapp';
import { notificationService } from './notification.service';

/**
 * Webhook da WhatsApp Cloud API, montado em /api/v1/webhooks/whatsapp (público, sem login).
 * Segurança: toda chamada POST precisa da assinatura HMAC da Meta (X-Hub-Signature-256).
 */
const router = Router();

// Verificação feita pela Meta ao cadastrar o webhook.
router.get('/', (req, res) => {
  const ok = env.WHATSAPP_VERIFY_TOKEN && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN;
  if (!ok) return res.sendStatus(403);
  res.status(200).send(String(req.query['hub.challenge'] ?? ''));
});

interface WebhookBody {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: { id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; errors?: { title?: string }[] }[];
        messages?: { from: string; type: string; text?: { body: string } }[];
      };
    }[];
  }[];
}

router.post('/', async (req: Request & { rawBody?: Buffer }, res) => {
  if (!env.WHATSAPP_APP_SECRET) return res.sendStatus(503);
  if (!validSignature(req.rawBody, req.header('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) return res.sendStatus(401);

  const body = req.body as WebhookBody;
  for (const change of body.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    const value = change.value;
    const tenant = value?.metadata?.phone_number_id
      ? await prisma.tenant.findUnique({ where: { whatsappPhoneNumberId: value.metadata.phone_number_id } })
      : null;
    if (!tenant) continue;

    for (const s of value?.statuses ?? []) {
      if (s.status === 'failed') {
        await prisma.notification.updateMany({
          where: { externalId: s.id, tenantId: tenant.id },
          data: { status: 'FAILED', lastError: s.errors?.[0]?.title ?? 'Falha na entrega (WhatsApp)' },
        });
      }
    }
    for (const m of value?.messages ?? []) {
      if (m.type === 'text' && m.text?.body) await notificationService.handleIncoming(tenant, `+${m.from}`, m.text.body);
    }
  }
  // A Meta reenvia se não receber 200 rápido; o processamento acima é curto (só grava e enfileira).
  res.sendStatus(200);
});

export { router as whatsappWebhookRoutes };
