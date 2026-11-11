// Integração da Fase 3: fila de mensagens, lembretes, WhatsApp (API da Meta simulada), webhook, lista de espera e faltas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.WHATSAPP_TOKEN = 'token-de-teste';
process.env.WHATSAPP_APP_SECRET = 'segredo-de-teste';

// ---- API da Meta simulada: intercepta só graph.facebook.com ----
const realFetch = globalThis.fetch;
const sent: { url: string; body: { to: string; type: string; template?: { name: string; components: { parameters: unknown[] }[] }; text?: { body: string } } }[] = [];
let metaFails = false;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith('https://graph.facebook.com/')) return realFetch(input, init);
  sent.push({ url, body: JSON.parse(String(init?.body)) });
  if (metaFails) return new Response(JSON.stringify({ error: { message: 'Template não aprovado' } }), { status: 400 });
  return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), { status: 200 });
}) as typeof fetch;

let base = '';
let server: Server;
let prisma: typeof import('./config/database').prisma;
let queue: typeof import('./modules/notification/queue');
let time: typeof import('./utils/time');
const run = `n${Date.now().toString(36)}`;
const PHONE_ID = String(Date.now()).slice(-12);
const tz = 'America/Sao_Paulo';
let date = '';
const ctx = {} as { tenantId: string; slug: string; owner: string; barberId: string; serviceId: string };

async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) {
  const res = await realFetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.raw ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const book = (time: string, phone: string, extra: Record<string, unknown> = {}) =>
  call('POST', `/public/${ctx.slug}/bookings`, {
    body: { clientName: 'Maria Teste', clientPhone: phone, barberId: ctx.barberId, serviceId: ctx.serviceId, date, time, acceptTerms: true, ...extra },
  });

/** Faz as mensagens desta barbearia vencerem agora e roda o worker. */
async function flush() {
  await prisma.notification.updateMany({ where: { tenantId: ctx.tenantId, status: 'PENDING' }, data: { scheduledFor: new Date() } });
  await queue.processDue(200);
}

function webhook(payload: unknown, secret = 'segredo-de-teste') {
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  return call('POST', '/webhooks/whatsapp', { raw, headers: { 'x-hub-signature-256': sig } });
}
const incoming = (fromE164: string, text: string) =>
  webhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, messages: [{ from: fromE164.slice(1), type: 'text', text: { body: text } }] } }] }] });

before(async () => {
  ({ prisma } = await import('./config/database'));
  queue = await import('./modules/notification/queue');
  time = await import('./utils/time');
  const { app } = await import('./app');
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  date = time.addDays(time.utcToZoned(new Date(), tz).date, 3);

  const tenant = await prisma.tenant.create({
    data: { slug: `t-${run}`, name: 'Barbearia Teste', minAdvanceMinutes: 0, reminderHours: 24, whatsappPhoneNumberId: PHONE_ID },
  });
  const passwordHash = await bcrypt.hash('senha-de-teste-123', 4);
  const mk = async (who: string, role: 'OWNER' | 'BARBER') => {
    const user = await prisma.user.create({ data: { name: who, email: `${who}-${run}@test.local`, passwordHash } });
    return prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role }, include: { user: true } });
  };
  const owner = await mk('owner', 'OWNER');
  const barber = await mk('barber', 'BARBER');
  const service = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Corte', description: 'corte', priceCents: 4500, durationMinutes: 30 } });
  await prisma.barberService.create({ data: { membershipId: barber.id, serviceId: service.id } });
  await prisma.availability.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ membershipId: barber.id, dayOfWeek: d, startTime: '08:00', endTime: '20:00' })) });
  const login = await call('POST', '/auth/login', { body: { email: owner.user.email, password: 'senha-de-teste-123' } });
  Object.assign(ctx, { tenantId: tenant.id, slug: tenant.slug, owner: login.json.data.accessToken, barberId: barber.id, serviceId: service.id });
});

after(async () => {
  await prisma.booking.deleteMany({ where: { tenantId: ctx.tenantId } });
  await prisma.tenant.delete({ where: { id: ctx.tenantId } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@test.local` } } });
  await prisma.$disconnect();
  server.close();
  globalThis.fetch = realFetch;
});

test('agendar online enfileira confirmação e lembrete 24h antes', async () => {
  const r = await book('10:00', '11 91111-0001');
  assert.equal(r.status, 201);
  const ns = await prisma.notification.findMany({ where: { bookingId: r.json.data.id }, orderBy: { type: 'asc' } });
  assert.deepEqual(ns.map((n) => n.type).sort(), ['CONFIRMATION', 'REMINDER']);
  const reminder = ns.find((n) => n.type === 'REMINDER')!;
  assert.equal(reminder.scheduledFor.getTime(), new Date(r.json.data.startAt).getTime() - 24 * 3_600_000);
});

test('worker envia por template no WhatsApp e apaga o token do link do banco', async () => {
  sent.length = 0;
  const r = await book('11:00', '11 91111-0002');
  const confirmation = await prisma.notification.findFirstOrThrow({ where: { bookingId: r.json.data.id, type: 'CONFIRMATION' } });
  assert.ok((confirmation.payload as { manageToken: string }).manageToken);
  await queue.processDue(200);

  const after = await prisma.notification.findUniqueOrThrow({ where: { id: confirmation.id } });
  assert.equal(after.status, 'SENT');
  assert.equal(after.channel, 'WHATSAPP');
  assert.ok(after.externalId?.startsWith('wamid.'));
  assert.equal(after.payload, null);

  const msg = sent.find((s) => s.body.to === '5511911110002')!;
  assert.ok(msg.url.includes(`/${PHONE_ID}/messages`));
  assert.equal(msg.body.template!.name, 'agendamento_confirmado');
  assert.equal(msg.body.template!.components[0].parameters.length, 7);
});

test('falha na Meta: tenta de novo com espera e desiste na 5ª tentativa', async () => {
  const r = await book('12:00', '11 91111-0003');
  const n = await prisma.notification.findFirstOrThrow({ where: { bookingId: r.json.data.id, type: 'CONFIRMATION' } });
  metaFails = true;
  try {
    await queue.processDue(200);
    let cur = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    assert.equal(cur.status, 'PENDING');
    assert.equal(cur.attempts, 1);
    assert.ok(cur.scheduledFor > new Date());
    assert.match(cur.lastError!, /Template não aprovado/);
    for (let i = 0; i < 4; i++) {
      await prisma.notification.update({ where: { id: n.id }, data: { scheduledFor: new Date() } });
      await queue.processDue(200);
    }
    cur = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    assert.equal(cur.status, 'FAILED');
    assert.equal(cur.attempts, 5);
  } finally {
    metaFails = false;
  }
  // reenviar pelo painel
  assert.equal((await call('POST', `/notifications/${n.id}/retry`, { token: ctx.owner })).status, 200);
  await queue.processDue(200);
  assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status, 'SENT');
});

test('dois workers ao mesmo tempo não mandam a mesma mensagem duas vezes', async () => {
  for (let i = 0; i < 6; i++) await book(`${13 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`, `11 9222${i}-0000`);
  sent.length = 0;
  const pending = await prisma.notification.count({ where: { tenantId: ctx.tenantId, status: 'PENDING', scheduledFor: { lte: new Date() } } });
  await Promise.all([queue.processDue(4), queue.processDue(4), queue.processDue(4), queue.processDue(4)]);
  assert.equal(sent.length, pending);
  assert.equal(new Set(sent.map((s) => s.body.to)).size, pending);
});

test('lembrete de horário remarcado é descartado; o novo é enviado', async () => {
  const r = await book('09:00', '11 91111-0004');
  const id = r.json.data.id;
  assert.equal((await call('PATCH', `/bookings/${id}/reschedule`, { token: ctx.owner, body: { date, time: '17:00' } })).status, 200);
  await flush();
  const reminders = await prisma.notification.findMany({ where: { bookingId: id, type: 'REMINDER' }, orderBy: { createdAt: 'asc' } });
  assert.equal(reminders.length, 2);
  assert.equal(reminders[0].status, 'SKIPPED');
  assert.match(reminders[0].lastError!, /remarcado/);
  assert.equal(reminders[1].status, 'SENT');
});

test('sem consentimento (agendado no balcão sem autorização) a mensagem é pulada', async () => {
  const body = { clientName: 'Sem Aceite', clientPhone: '11 93333-0001', barberId: ctx.barberId, serviceId: ctx.serviceId, date, time: '19:00' };
  const r = await call('POST', '/bookings', { token: ctx.owner, body });
  assert.equal(r.status, 201);
  await flush();
  const n = await prisma.notification.findFirstOrThrow({ where: { bookingId: r.json.data.id, type: 'CONFIRMATION' } });
  assert.equal(n.status, 'SKIPPED');
  assert.match(n.lastError!, /consentimento/);
});

test('webhook sem assinatura válida é recusado', async () => {
  assert.equal((await call('POST', '/webhooks/whatsapp', { body: { entry: [] } })).status, 401);
  assert.equal((await webhook({ entry: [] }, 'segredo-errado')).status, 401);
  assert.equal((await webhook({ entry: [] })).status, 200);
});

test('cliente responde 2: cancela o próximo horário e avisa a lista de espera', async () => {
  const r = await book('18:00', '11 94444-0001');
  assert.equal(r.status, 201);
  const w = await call('POST', `/public/${ctx.slug}/waitlist`, {
    body: { clientName: 'Esperando', clientPhone: '11 95555-0001', serviceId: ctx.serviceId, date, acceptTerms: true },
  });
  assert.equal(w.status, 201);

  assert.equal((await incoming('+5511944440001', '2')).status, 200);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: r.json.data.id } })).status, 'CANCELLED');
  const waitingClient = await prisma.client.findUniqueOrThrow({ where: { tenantId_phone: { tenantId: ctx.tenantId, phone: '+5511955550001' } } });
  const alert = await prisma.notification.findFirstOrThrow({ where: { clientId: waitingClient.id, type: 'WAITLIST' } });
  assert.ok((alert.payload as { link: string }).link.includes(`date=${date}`));
  const entry = await prisma.waitlistEntry.findFirstOrThrow({ where: { clientId: waitingClient.id } });
  assert.ok(entry.notifiedAt);
});

test('cliente responde 1 e SAIR', async () => {
  const r = await book('16:30', '11 94444-0002');
  await incoming('+5511944440002', 'sim');
  const client = await prisma.client.findUniqueOrThrow({ where: { tenantId_phone: { tenantId: ctx.tenantId, phone: '+5511944440002' } } });
  const reply = await prisma.notification.findFirstOrThrow({ where: { clientId: client.id, type: 'MESSAGE' } });
  assert.match((reply.payload as { text: string }).text, /Presença confirmada/);

  await incoming('+5511944440002', 'SAIR');
  assert.ok((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).whatsappOptOutAt);
  await flush();
  const reminder = await prisma.notification.findFirstOrThrow({ where: { bookingId: r.json.data.id, type: 'REMINDER' } });
  assert.equal(reminder.status, 'SKIPPED');
});

test('webhook de falha na entrega marca a mensagem como falha', async () => {
  const n = await prisma.notification.findFirstOrThrow({ where: { tenantId: ctx.tenantId, status: 'SENT', externalId: { not: null } } });
  await webhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, statuses: [{ id: n.externalId, status: 'failed', errors: [{ title: 'Número inválido' }] }] } }] }] });
  const cur = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
  assert.equal(cur.status, 'FAILED');
  assert.equal(cur.lastError, 'Número inválido');
});

test('política de faltas: quem faltou demais agenda como pendente', async () => {
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { noShowLimit: 1 } });
  const first = await book('08:00', '11 96666-0001');
  await prisma.booking.update({ where: { id: first.json.data.id }, data: { status: 'NO_SHOW', startAt: new Date(Date.now() - 86_400_000), endAt: new Date(Date.now() - 86_400_000 + 1_800_000) } });
  const second = await book('08:30', '11 96666-0001');
  assert.equal(second.status, 201);
  assert.equal(second.json.data.status, 'PENDING');
  const someoneElse = await book('18:30', '11 96666-0002');
  assert.equal(someoneElse.json.data.status, 'CONFIRMED');
});
