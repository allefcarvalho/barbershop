const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 4500 → "R$ 45,00" (valores trafegam em centavos). */
export const formatBRL = (cents: number) => brl.format(cents / 100);

/** "+5511966661234" → "(11) 96666-1234". Números de fora do Brasil ficam como estão. */
export function formatPhone(e164: string) {
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
