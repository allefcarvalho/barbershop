// Cliente mínimo da WhatsApp Cloud API (Meta). Sem SDK: é uma chamada HTTP.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import type { RenderedMessage } from './messages';

/** Envia e devolve o ID da mensagem no WhatsApp. Lança erro (com a mensagem da Meta) se falhar. */
export async function sendWhatsApp(phoneNumberId: string, toE164: string, msg: RenderedMessage): Promise<string> {
  const to = toE164.replace(/\D/g, '');
  const body = msg.template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: msg.template,
          language: { code: 'pt_BR' },
          components: [{ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text })) }],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.text } };

  const res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok || !json.messages?.[0]?.id) throw new Error(`WhatsApp ${res.status}: ${json.error?.message ?? 'resposta inesperada'}`);
  return json.messages[0].id;
}

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo com o App Secret). */
export function validSignature(rawBody: Buffer | undefined, header: string | undefined, secret: string) {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return got.length === expected.length && timingSafeEqual(got, expected);
}
