// Integração da Fase 2: comanda, caixa, estorno, comissões e relatório (banco do .env; dados próprios, apagados no fim).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';

let base = '';
let server: Server;
let prisma: typeof import('./config/database').prisma;
const run = `f${Date.now().toString(36)}`;
const PASSWORD = 'senha-de-teste-123';
const tz = 'America/Sao_Paulo';
let today = '';

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const ctx = {} as {
  tenantId: string;
  owner: string; // tokens
  barber: string;
  barberId: string;
  otherBarberId: string;
  clientId: string;
  serviceId: string; // R$ 70,00
  productId: string; // R$ 30,00, estoque 3
  bookingId: string;
  otherBookingId: string;
};

before(async () => {
  ({ prisma } = await import('./config/database'));
  const { app } = await import('./app');
  const time = await import('./utils/time');
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  today = time.utcToZoned(new Date(), tz).date;

  const tenant = await prisma.tenant.create({ data: { slug: `t-${run}`, name: 'Teste Fin' } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const mk = async (who: string, role: 'OWNER' | 'BARBER', pct = 0) => {
    const user = await prisma.user.create({ data: { name: who, email: `${who}-${run}@test.local`, passwordHash } });
    const m = await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role, serviceCommissionPct: pct, productCommissionPct: pct ? 10 : 0 } });
    const token = (await call('POST', '/auth/login', undefined, { email: user.email, password: PASSWORD })).json.data.accessToken;
    return { m, token };
  };
  const owner = await mk('owner', 'OWNER');
  const barber = await mk('barber', 'BARBER', 40);
  const other = await mk('other', 'BARBER', 50);
  const service = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Corte + Barba', description: 'combo', priceCents: 7000, durationMinutes: 60 } });
  const product = await prisma.product.create({ data: { tenantId: tenant.id, name: 'Pomada', description: 'pomada', priceCents: 3000, stockQuantity: 3 } });
  const client = await prisma.client.create({ data: { tenantId: tenant.id, name: 'Cliente', phone: '+5511900001111' } });
  const mkBooking = (barberId: string, hour: number) =>
    prisma.booking.create({
      data: {
        tenantId: tenant.id, clientId: client.id, barberId, serviceId: service.id,
        startAt: new Date(Date.now() - hour * 3_600_000), endAt: new Date(Date.now() - hour * 3_600_000 + 3_600_000),
        priceCents: 6500, durationMinutes: 60, // preço reservado (antes de um reajuste)
      },
    });
  Object.assign(ctx, {
    tenantId: tenant.id, owner: owner.token, barber: barber.token, barberId: barber.m.id, otherBarberId: other.m.id,
    clientId: client.id, serviceId: service.id, productId: product.id,
    bookingId: (await mkBooking(barber.m.id, 3)).id, otherBookingId: (await mkBooking(other.m.id, 2)).id,
  });
});

after(async () => {
  await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(async () => {
    // ordem manual se o cascade esbarrar em FK sem cascade
    await prisma.order.deleteMany({ where: { tenantId: ctx.tenantId } });
    await prisma.cashRegister.deleteMany({ where: { tenantId: ctx.tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId: ctx.tenantId } });
    await prisma.stockMovement.deleteMany({ where: { product: { tenantId: ctx.tenantId } } });
    await prisma.tenant.delete({ where: { id: ctx.tenantId } });
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${run}@test.local` } } });
  await prisma.$disconnect();
  server.close();
});

const charge = (token: string, body: Record<string, unknown>) => call('POST', '/orders', token, body);
const bookingCheckout = (bookingId: string, extra: Record<string, unknown> = {}) => ({
  bookingId,
  items: [{ kind: 'SERVICE', id: ctx.serviceId }],
  payments: [{ method: 'PIX', amountCents: 6500 }],
  ...extra,
});

test('sem caixa aberto não cobra', async () => {
  const r = await charge(ctx.owner, bookingCheckout(ctx.bookingId));
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'REGISTER_CLOSED');
});

test('abrir caixa: só um aberto por vez', async () => {
  assert.equal((await call('POST', '/register/open', ctx.barber, { openingCents: 5000 })).status, 403);
  const [a, b] = await Promise.all([
    call('POST', '/register/open', ctx.owner, { openingCents: 5000 }),
    call('POST', '/register/open', ctx.owner, { openingCents: 5000 }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
});

test('pagamento diferente do total é recusado', async () => {
  const r = await charge(ctx.owner, bookingCheckout(ctx.bookingId, { payments: [{ method: 'PIX', amountCents: 7000 }] }));
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'PAYMENT_MISMATCH');
});

test('barbeiro não cobra atendimento de outro barbeiro', async () => {
  const r = await charge(ctx.barber, bookingCheckout(ctx.otherBookingId));
  assert.equal(r.status, 403);
});

test('comanda do agendamento: preço reservado, desconto, gorjeta, produto, comissão e conclusão', async () => {
  // corte (6500 reservado) + pomada (3000) = 9500; desconto 500; gorjeta 1000 → total 10000
  const r = await charge(ctx.barber, {
    bookingId: ctx.bookingId,
    items: [{ kind: 'SERVICE', id: ctx.serviceId }, { kind: 'PRODUCT', id: ctx.productId, quantity: 1 }],
    discountCents: 500,
    tipCents: 1000,
    payments: [{ method: 'CASH', amountCents: 4000 }, { method: 'CREDIT', amountCents: 6000 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const o = r.json.data;
  assert.equal(o.subtotalCents, 9500);
  assert.equal(o.totalCents, 10000);
  const svc = o.items.find((i: { kind: string }) => i.kind === 'SERVICE');
  const prod = o.items.find((i: { kind: string }) => i.kind === 'PRODUCT');
  assert.equal(svc.unitPriceCents, 6500);
  assert.equal(svc.totalCents + prod.totalCents, 9000);
  assert.equal(svc.commissionCents, Math.round(svc.totalCents * 0.4));
  assert.equal(prod.commissionCents, Math.round(prod.totalCents * 0.1));

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: ctx.bookingId } });
  assert.equal(booking.status, 'COMPLETED');
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: ctx.productId } })).stockQuantity, 2);
  assert.equal((await prisma.client.findUniqueOrThrow({ where: { id: ctx.clientId } })).totalBookings, 1);
});

test('o mesmo agendamento não é cobrado duas vezes', async () => {
  const r = await charge(ctx.owner, bookingCheckout(ctx.bookingId));
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'ALREADY_CHARGED');
});

test('venda avulsa sem estoque falha inteira (nada é gravado)', async () => {
  const before = await prisma.order.count({ where: { tenantId: ctx.tenantId } });
  const r = await charge(ctx.owner, { items: [{ kind: 'PRODUCT', id: ctx.productId, quantity: 5 }], payments: [{ method: 'PIX', amountCents: 15000 }] });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'INSUFFICIENT_STOCK');
  assert.equal(await prisma.order.count({ where: { tenantId: ctx.tenantId } }), before);
});

test('caixa: sangria, suprimento e dinheiro esperado', async () => {
  assert.equal((await call('POST', '/register/movements', ctx.owner, { type: 'WITHDRAWAL', amountCents: 999999, reason: 'teste' })).status, 400);
  await call('POST', '/register/movements', ctx.owner, { type: 'DEPOSIT', amountCents: 2000, reason: 'troco' });
  const r = await call('POST', '/register/movements', ctx.owner, { type: 'WITHDRAWAL', amountCents: 3000, reason: 'depósito no banco' });
  // abertura 5000 + dinheiro 4000 + suprimento 2000 - sangria 3000 = 8000
  assert.equal(r.json.data.expectedCashCents, 8000);
  assert.equal(r.json.data.byMethod.CREDIT, 6000);
  assert.equal(r.json.data.tipsCents, 1000);
});

test('relatório e comissões do período', async () => {
  const period = `from=${today}&to=${today}`;
  assert.equal((await call('GET', `/reports?${period}`, ctx.barber)).status, 403);
  const rep = (await call('GET', `/reports?${period}`, ctx.owner)).json.data;
  assert.equal(rep.orders, 1);
  assert.equal(rep.revenueCents, 9000); // sem gorjeta
  assert.equal(rep.tipsCents, 1000);
  assert.equal(rep.byMethod.CASH, 4000);
  assert.equal(rep.byBarber[0].tipsCents, 1000);

  const mine = (await call('GET', `/commissions?${period}`, ctx.barber)).json.data;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].barberId, ctx.barberId);
  const pending = mine[0].pendingCents;
  assert.ok(pending > 0);

  assert.equal((await call('POST', '/commissions/pay', ctx.barber, { barberId: ctx.barberId, from: today, to: today })).status, 403);
  const paid = await call('POST', '/commissions/pay', ctx.owner, { barberId: ctx.barberId, from: today, to: today });
  assert.equal(paid.json.data.amountCents, pending);
  const after = (await call('GET', `/commissions?${period}`, ctx.owner)).json.data.find((c: { barberId: string }) => c.barberId === ctx.barberId);
  assert.equal(after.pendingCents, 0);
  assert.equal(after.paidCents, pending);
});

test('estorno: bloqueado com comissão paga; senão devolve estoque e some do relatório', async () => {
  const order = await prisma.order.findFirstOrThrow({ where: { tenantId: ctx.tenantId } });
  assert.equal((await call('POST', `/orders/${order.id}/void`, ctx.owner, { reason: 'erro de cobrança' })).json.code, 'COMMISSION_PAID');

  // venda avulsa nova (sem comissão) para estornar
  const sale = await charge(ctx.owner, { items: [{ kind: 'PRODUCT', id: ctx.productId, quantity: 1 }], payments: [{ method: 'DEBIT', amountCents: 3000 }] });
  assert.equal(sale.status, 201);
  assert.equal((await call('POST', `/orders/${sale.json.data.id}/void`, ctx.barber, { reason: 'teste' })).status, 403);
  const v = await call('POST', `/orders/${sale.json.data.id}/void`, ctx.owner, { reason: 'cliente desistiu' });
  assert.equal(v.json.data.status, 'VOIDED');
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: ctx.productId } })).stockQuantity, 2);
  const rep = (await call('GET', `/reports?from=${today}&to=${today}`, ctx.owner)).json.data;
  assert.equal(rep.byMethod.DEBIT, 0);
});

test('fechar caixa mostra a diferença do dinheiro contado', async () => {
  const r = await call('POST', '/register/close', ctx.owner, { countedCashCents: 7900 });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.differenceCents, -100);
  assert.equal((await call('GET', '/register', ctx.owner)).json.data, null);
});
