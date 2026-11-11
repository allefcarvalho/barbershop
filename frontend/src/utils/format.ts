const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 4500 → "R$ 45,00" (valores trafegam em centavos). */
export const formatBRL = (cents: number) => brl.format(cents / 100);

/** "+5511966661234" → "(11) 96666-1234". Números de fora do Brasil ficam como estão. */
export function formatPhone(e164: string) {
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** "45,90" / "45.90" / "R$ 45" → 4590 centavos. Retorna null se não for um valor válido. */
export function parseBRL(text: string): number | null {
  const clean = text.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

/** 4590 → "45,90" (para preencher campos de edição). */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
