// Cálculo da comanda: função pura (sem banco), testada em pricing.test.ts.

export interface LineInput {
  unitPriceCents: number;
  quantity: number;
  /** % de comissão do profissional para este tipo de item (0–100) */
  commissionPct: number;
}

export interface PricedLine extends LineInput {
  grossCents: number;
  /** Valor da linha depois do desconto: base da comissão (RN19) */
  totalCents: number;
  commissionCents: number;
}

export interface PricedOrder {
  subtotalCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  lines: PricedLine[];
}

/**
 * Rateia o desconto entre as linhas na proporção do valor de cada uma.
 * Usa o método do maior resto para os centavos baterem exatamente com o desconto informado.
 */
export function priceOrder(lines: LineInput[], discountCents: number, tipCents: number): PricedOrder {
  const gross = lines.map((l) => l.unitPriceCents * l.quantity);
  const subtotalCents = gross.reduce((a, b) => a + b, 0);
  if (discountCents < 0 || tipCents < 0) throw new Error('Desconto e gorjeta não podem ser negativos');
  if (discountCents > subtotalCents) throw new Error('Desconto maior que o valor da comanda');

  const exact = gross.map((g) => (subtotalCents ? (g * discountCents) / subtotalCents : 0));
  const shares = exact.map(Math.floor);
  let left = discountCents - shares.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    shares[i]++;
    left--;
  }

  const priced = lines.map((l, i) => {
    const totalCents = gross[i] - shares[i];
    return { ...l, grossCents: gross[i], totalCents, commissionCents: Math.round((totalCents * l.commissionPct) / 100) };
  });

  return { subtotalCents, discountCents, tipCents, totalCents: subtotalCents - discountCents + tipCents, lines: priced };
}
