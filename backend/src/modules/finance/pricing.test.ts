import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceOrder } from './pricing';

test('sem desconto: comissão sobre o valor cheio', () => {
  const o = priceOrder([{ unitPriceCents: 7000, quantity: 1, commissionPct: 40 }], 0, 500);
  assert.equal(o.subtotalCents, 7000);
  assert.equal(o.totalCents, 7500); // gorjeta entra no total pago
  assert.equal(o.lines[0].commissionCents, 2800);
});

test('desconto rateado na proporção e somando exatamente', () => {
  // corte R$ 45 + pomada 2x R$ 30 = R$ 105; desconto de R$ 10
  const o = priceOrder(
    [
      { unitPriceCents: 4500, quantity: 1, commissionPct: 50 },
      { unitPriceCents: 3000, quantity: 2, commissionPct: 10 },
    ],
    1000,
    0,
  );
  assert.equal(o.lines.reduce((s, l) => s + (l.grossCents - l.totalCents), 0), 1000);
  assert.equal(o.lines[0].totalCents, 4071); // 4500 - 428,57… (arredondado pelo maior resto)
  assert.equal(o.lines[1].totalCents, 5429);
  assert.equal(o.lines[0].commissionCents, 2036); // 50% de 40,71
  assert.equal(o.lines[1].commissionCents, 543); // 10% de 54,29
  assert.equal(o.totalCents, 9500);
});

test('centavos do desconto não se perdem com muitas linhas iguais', () => {
  const lines = Array.from({ length: 3 }, () => ({ unitPriceCents: 1000, quantity: 1, commissionPct: 0 }));
  const o = priceOrder(lines, 100, 0); // 33,33… cada
  assert.deepEqual(o.lines.map((l) => l.totalCents).sort(), [966, 967, 967]);
  assert.equal(o.totalCents, 2900);
});

test('desconto maior que o subtotal é recusado', () => {
  assert.throws(() => priceOrder([{ unitPriceCents: 1000, quantity: 1, commissionPct: 0 }], 1001, 0));
});
