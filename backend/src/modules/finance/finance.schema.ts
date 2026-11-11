import { z } from 'zod';
import { DATE_RE } from '../../utils/time';

const cents = z.number().int().min(0).max(10_000_000);

export const checkoutSchema = z
  .object({
    /** Comanda de um agendamento: conclui o agendamento junto. Sem ele = venda avulsa no balcão. */
    bookingId: z.string().uuid().optional(),
    /** Venda avulsa: quem atendeu (comissão/gorjeta). Opcional para venda só de produto. */
    barberId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    items: z
      .array(
        z.object({
          kind: z.enum(['SERVICE', 'PRODUCT']),
          id: z.string().uuid(),
          quantity: z.number().int().min(1).max(100).default(1),
        }),
      )
      .min(1, 'Adicione ao menos um item'),
    discountCents: cents.default(0),
    tipCents: cents.default(0),
    payments: z
      .array(z.object({ method: z.enum(['PIX', 'CREDIT', 'DEBIT', 'CASH']), amountCents: cents.refine((n) => n > 0, 'Valor deve ser positivo') }))
      .min(1, 'Informe a forma de pagamento'),
  })
  .refine((o) => !(o.bookingId && o.barberId), 'Use bookingId ou barberId, não os dois');

export const voidSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo').max(200) });

export const openRegisterSchema = z.object({ openingCents: cents });
export const cashMovementSchema = z.object({
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  amountCents: cents.refine((n) => n > 0, 'Valor deve ser positivo'),
  reason: z.string().trim().min(3).max(200),
});
export const closeRegisterSchema = z.object({ countedCashCents: cents, notes: z.string().trim().max(500).optional() });

export const periodSchema = z
  .object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE), barberId: z.string().uuid().optional() })
  .refine((p) => p.from <= p.to, 'Data inicial depois da final')
  .refine((p) => (new Date(p.to).getTime() - new Date(p.from).getTime()) / 86_400_000 <= 366, 'Período máximo de 1 ano');

export const payCommissionSchema = z.object({
  barberId: z.string().uuid(),
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type PeriodInput = z.infer<typeof periodSchema>;
