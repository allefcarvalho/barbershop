const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 4500 → "R$ 45,00" (valores trafegam em centavos). */
export const formatBRL = (cents: number) => brl.format(cents / 100);
