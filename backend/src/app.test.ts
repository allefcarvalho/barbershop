// Testes de integração contra o PostgreSQL do .env (cria barbearias próprias e apaga no fim).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';

type Res = { status: number; json: any; cookie: string | null };
let base = '';
let server: Server;
let prisma: typeof import('./config/database').prisma;
let time: typeof import('./utils/time');

const run = Date.now().toString(36);
const tz = 'America/Sao_Paulo';
const PASSWORD = 'senha-de-teste-123';
let date = '';
const at = (t: string) => time.zonedToUtc(date, t, tz).toISOString();

async function call(method: string, path: string, opts: { body?: unknown; token?: string; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(base + path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0] ?? null };
}

async function makeTenant(key: string) {
  const tenant = await prisma.tenant.create({ data: { slug: `t-${key}-${run}`, name: `Teste ${key}`, minAdvanceMinutes: 0 } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const mk = async (who: string, role: 'OWNER' | 'BARBER') => {
    const user = await prisma.user.create({ data: { name: `${who} ${key}`, email: `${who}-${key}-${run}@test.local`, passwordHash } });
    return prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role }, include: { user: true } });
  };
  const owner = await mk('owner', 'OWNER');
  const barber1 = await mk('barber1', 'BARBER');
  const barber2 = await mk('barber2', 'BARBER');
  const s60 = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Corte + Barba', description: 'combo', priceCents: 7000, durationMinutes: 60 } });
  const s35 = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Corte', description: 'corte', priceCents: 4500, durationMinutes: 35 } });
  for (const b of [barber1, barber2]) {
    await prisma.barberService.createMany({ data: [s60, s35].map((s) => ({ membershipId: b.id, serviceId: s.id })) });
    await prisma.availability.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ membershipId: b.id, dayOfWeek: d, startTime: '09:00', endTime: '18:00' })) });
  }
  const login = async (m: { user: { email: string } }) =>
    (await call('POST', '/auth/login', { body: { email: m.user.email, password: PASSWORD } })).json.data.accessToken as string;
  return { tenant, owner, barber1, barber2, s60, s35, login };
}

let A: Awaited<ReturnType<typeof makeTenant>>;
let B: Awaited<ReturnType<typeof makeTenant>>;

const book = (t: typeof A, time: string, phone: string, extra: Record<string, unknown> = {}) =>
  call('POST', `/public/${t.tenant.slug}/bookings`, {
    body: { clientName: 'Cliente Teste', clientPhone: phone, barberId: t.barber1.id, serviceId: t.s35.id, date, time, acceptTerms: true, ...extra },
  });

before(async () => {
  ({ prisma } = await import('./config/database'));
  time = await import('./utils/time');
  const { app } = await import('./app');
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  date = time.addDays(time.utcToZoned(new Date(), tz).date, 2);
  A = await makeTenant('a');
  B = await makeTenant('b');
});

after(async () => {
  const tenantIds = [A?.tenant.id, B?.tenant.id].filter(Boolean) as string[];
  await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@test.local` } } });
  await prisma.$disconnect();
  server.close();
});

test('slots consideram a duração do serviço', async () => {
  assert.equal((await book(A, '10:00', '11 90000-0001')).status, 201);
  const r = await call('GET', `/public/${A.tenant.slug}/barbers/${A.barber1.id}/slots?date=${date}&serviceId=${A.s60.id}`);
  const times = r.json.data.map((s: { time: string }) => s.time);
  assert.ok(times.includes('09:00'), '09:00–10:00 cabe');
  assert.ok(!times.includes('09:15') && !times.includes('10:30'), 'não oferece horário que bate no agendamento');
  assert.ok(times.includes('10:45'));
});

test('10 agendamentos simultâneos no mesmo horário: só 1 passa', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => book(A, '14:00', `11 9100${String(i).padStart(2, '0')}-00`)));
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 201).length, 1, `status: ${statuses}`);
  assert.ok(statuses.filter((s) => s !== 201).every((s) => s === 409));
  const n = await prisma.booking.count({ where: { barberId: A.barber1.id, startAt: new Date(at('14:00')) } });
  assert.equal(n, 1);
});

test('banco recusa sobreposição mesmo sem passar pela API (constraint EXCLUDE)', async () => {
  const existing = await prisma.booking.findFirstOrThrow({ where: { barberId: A.barber1.id, status: 'CONFIRMED' } });
  const overlap = prisma.booking.create({
    data: { ...existing, id: undefined, createdAt: undefined, updatedAt: undefined, startAt: new Date(existing.startAt.getTime() + 10 * 60_000), endAt: new Date(existing.endAt.getTime() + 10 * 60_000) },
  });
  await assert.rejects(overlap, /bookings_no_overlap|23P01/);
});

test('horário fora da jornada é recusado', async () => {
  const r = await book(A, '19:00', '11 90000-0002');
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'SLOT_UNAVAILABLE');
});

test('agendamento público não sobrescreve o nome de cliente existente', async () => {
  assert.equal((await book(A, '16:00', '(11) 90000-0001', { clientName: 'Outra Pessoa' })).status, 201);
  const client = await prisma.client.findUniqueOrThrow({ where: { tenantId_phone: { tenantId: A.tenant.id, phone: '+5511900000001' } } });
  assert.equal(client.name, 'Cliente Teste');
});

test('isolamento: barbearia B não enxerga dados da A', async () => {
  const bookingA = await prisma.booking.findFirstOrThrow({ where: { tenantId: A.tenant.id } });
  const tokenB = await B.login(B.owner);
  assert.equal((await call('GET', `/bookings/${bookingA.id}`, { token: tokenB })).status, 404);
  const list = await call('GET', '/bookings', { token: tokenB });
  assert.equal(list.json.data.length, 0);
  assert.equal((await call('GET', `/availability/${A.barber1.id}`, { token: tokenB })).status, 404);
  const slots = await call('GET', `/public/${B.tenant.slug}/barbers/${A.barber1.id}/slots?date=${date}&serviceId=${A.s35.id}`);
  assert.equal(slots.status, 404);
});

test('IDOR: barbeiro não altera a agenda nem vê agendamento de outro barbeiro', async () => {
  const t2 = await A.login(A.barber2);
  const t1 = await A.login(A.barber1);
  const schedule = { schedules: [{ dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }] };
  assert.equal((await call('PUT', `/availability/${A.barber1.id}`, { token: t2, body: schedule })).status, 403);
  assert.equal((await call('PUT', `/availability/${A.barber2.id}`, { token: t2, body: schedule })).status, 200);
  const bookingB1 = await prisma.booking.findFirstOrThrow({ where: { barberId: A.barber1.id } });
  assert.equal((await call('GET', `/bookings/${bookingB1.id}`, { token: t2 })).status, 404);
  assert.equal((await call('GET', `/bookings/${bookingB1.id}`, { token: t1 })).status, 200);
});

test('refresh token: rotação e revogação ao detectar reuso', async () => {
  const login = await call('POST', '/auth/login', { body: { email: A.owner.user.email, password: PASSWORD } });
  const rt1 = login.cookie!;
  const r2 = await call('POST', '/auth/refresh', { cookie: rt1 });
  assert.equal(r2.status, 200);
  const rt2 = r2.cookie!;
  assert.notEqual(rt1, rt2);
  const reuse = await call('POST', '/auth/refresh', { cookie: rt1 });
  assert.equal(reuse.status, 401);
  assert.equal(reuse.json.code, 'TOKEN_REUSED');
  assert.equal((await call('POST', '/auth/refresh', { cookie: rt2 })).status, 401, 'família inteira revogada');
});

test('login com senha errada e e-mail inexistente dão a mesma resposta', async () => {
  const wrong = await call('POST', '/auth/login', { body: { email: A.owner.user.email, password: 'errada' } });
  const ghost = await call('POST', '/auth/login', { body: { email: `ninguem-${run}@test.local`, password: 'errada' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.json, ghost.json);
});

test('agendamento público exige aceite da política (LGPD)', async () => {
  const r = await book(A, '11:00', '11 90000-0003', { acceptTerms: false });
  assert.equal(r.status, 422);
});

test('equipe: barbeiro só agenda na própria agenda; encaixe começa agora', async () => {
  const t2 = await A.login(A.barber2);
  const body = { clientName: 'Balcão', clientPhone: '11 95555-0001', serviceId: A.s35.id, date, time: '12:00' };
  assert.equal((await call('POST', '/bookings', { token: t2, body: { ...body, barberId: A.barber1.id } })).status, 403);
  const own = await call('POST', '/bookings', { token: t2, body: { ...body, barberId: A.barber2.id } });
  assert.equal(own.status, 201);
  assert.equal(own.json.data.source, 'PANEL');

  const walkIn = await call('POST', '/bookings', { token: t2, body: { ...body, barberId: A.barber2.id, date: undefined, time: undefined, walkIn: true } });
  assert.equal(walkIn.status, 201);
  assert.equal(walkIn.json.data.source, 'WALK_IN');
  assert.ok(Math.abs(new Date(walkIn.json.data.startAt).getTime() - Date.now()) < 120_000);
});

test('remarcar para horário ocupado é recusado; para horário livre funciona', async () => {
  const owner = await A.login(A.owner);
  const b = await book(A, '15:00', '11 95555-0002');
  assert.equal(b.status, 201);
  const id = b.json.data.id;
  // 14:00 já está ocupado (teste de concorrência)
  assert.equal((await call('PATCH', `/bookings/${id}/reschedule`, { token: owner, body: { date, time: '14:10' } })).status, 409);
  const ok = await call('PATCH', `/bookings/${id}/reschedule`, { token: owner, body: { date, time: '17:00' } });
  assert.equal(ok.status, 200);
});

test('link do cliente: consulta e cancela; token errado não acha nada', async () => {
  const b = await book(A, '11:30', '11 95555-0003');
  assert.equal(b.status, 201);
  const token = b.json.data.manageToken as string;
  const base = `/public/${A.tenant.slug}/bookings/manage`;
  const view = await call('POST', base, { body: { token } });
  assert.equal(view.status, 200);
  assert.equal(view.json.data.canCancel, true);
  assert.equal(view.json.data.time, '11:30');
  assert.equal((await call('POST', base, { body: { token: 'x'.repeat(32) } })).status, 404);
  // token de uma barbearia não funciona no slug de outra
  assert.equal((await call('POST', `/public/${B.tenant.slug}/bookings/manage`, { body: { token } })).status, 404);
  const cancel = await call('POST', `${base}/cancel`, { body: { token } });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.json.data.status, 'CANCELLED');
  assert.equal((await call('POST', `${base}/cancel`, { body: { token } })).status, 400);
});

test('barbearia que exige confirmação: agendamento online nasce PENDING', async () => {
  await prisma.tenant.update({ where: { id: B.tenant.id }, data: { requireConfirmation: true } });
  const r = await book(B, '10:00', '11 95555-0004');
  assert.equal(r.status, 201);
  assert.equal(r.json.data.status, 'PENDING');
});

test('LGPD: só dono/gerente apaga dados do cliente; histórico continua', async () => {
  const client = await prisma.client.findUniqueOrThrow({ where: { tenantId_phone: { tenantId: A.tenant.id, phone: '+5511900000001' } } });
  const barber = await A.login(A.barber1);
  assert.equal((await call('POST', `/clients/${client.id}/anonymize`, { token: barber })).status, 403);
  const owner = await A.login(A.owner);
  assert.equal((await call('POST', `/clients/${client.id}/anonymize`, { token: owner })).status, 200);
  const after = await prisma.client.findUniqueOrThrow({ where: { id: client.id }, include: { bookings: true } });
  assert.equal(after.name, 'Cliente removido');
  assert.ok(!after.phone.includes('9000'));
  assert.ok(after.bookings.length > 0);
});

test('estoque: saída maior que o saldo é recusada', async () => {
  const product = await prisma.product.create({ data: { tenantId: A.tenant.id, name: 'Pomada', description: 'pomada', priceCents: 4500, stockQuantity: 3 } });
  const token = await A.login(A.owner);
  const out = (q: number) => call('POST', `/products/${product.id}/stock`, { token, body: { type: 'OUT', quantity: q } });
  assert.equal((await out(5)).status, 400);
  const results = await Promise.all([out(2), out(2)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity, 1);
  await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
});
