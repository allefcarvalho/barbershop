import { z } from 'zod';

/**
 * Normaliza para E.164. Número brasileiro sem DDI (10–11 dígitos) ganha +55.
 * ponytail: heurística só para BR; usar libphonenumber-js quando atender outros países.
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 12 || d.length > 15) return null;
  return '+' + d;
}

export const phoneSchema = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido' });
    return z.NEVER;
  }
  return p;
});
