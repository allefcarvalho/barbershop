// Fechar comanda: agendamento (pré-preenchido) ou venda avulsa no balcão.
// O total aqui é só prévia; o servidor recalcula com os preços do cadastro.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { formatBRL, parseBRL, centsToInput } from '../../utils/format';
import { useSession, useStaff, useAdminServices, PAYMENT_LABEL } from './admin';
import { Select } from './shared';

export interface CheckoutBooking {
  id: string;
  priceCents: number;
  client: { name: string };
  barber: { id: string; user: { name: string } };
  service: { id: string; name: string };
}

interface Line { kind: 'SERVICE' | 'PRODUCT'; id: string; name: string; unitPriceCents: number; quantity: number }
interface ProductOption { id: string; name: string; priceCents: number; stockQuantity: number; active: boolean }

type Method = keyof typeof PAYMENT_LABEL;

export function CheckoutModal({ booking, onClose }: { booking?: CheckoutBooking; onClose: () => void }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const { data: staff } = useStaff();
  const { data: services } = useAdminServices();
  const { data: products } = useQuery<ProductOption[]>({
    queryKey: ['admin', 'products'],
    queryFn: async () => (await api.get('/products')).data.data,
    enabled: user.role !== 'BARBER',
  });

  const [lines, setLines] = useState<Line[]>(
    booking ? [{ kind: 'SERVICE', id: booking.service.id, name: booking.service.name, unitPriceCents: booking.priceCents, quantity: 1 }] : [],
  );
  const [barberId, setBarberId] = useState(booking?.barber.id ?? (user.role === 'BARBER' ? user.membershipId : ''));
  const [discount, setDiscount] = useState('');
  const [tip, setTip] = useState('');
  const [payments, setPayments] = useState<{ method: Method; amount: string }[]>([{ method: 'PIX', amount: '' }]);
  const [received, setReceived] = useState('');

  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const discountCents = parseBRL(discount) ?? 0;
  const tipCents = parseBRL(tip) ?? 0;
  const total = subtotal - discountCents + tipCents;
  // Um pagamento só: o valor acompanha o total automaticamente.
  const single = payments.length === 1;
  const paymentCents = payments.map((p, i) => (single && i === 0 ? total : parseBRL(p.amount) ?? 0));
  const paid = paymentCents.reduce((a, b) => a + b, 0);
  const cashOnly = single && payments[0].method === 'CASH';
  const change = cashOnly && parseBRL(received) !== null ? (parseBRL(received) ?? 0) - total : null;

  const add = (kind: Line['kind'], id: string) => {
    if (!id) return;
    const existing = lines.find((l) => l.kind === kind && l.id === id);
    if (existing) return setLines(lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l)));
    const src = kind === 'SERVICE' ? services?.find((s) => s.id === id) : products?.find((p) => p.id === id);
    if (src) setLines([...lines, { kind, id, name: src.name, unitPriceCents: src.priceCents, quantity: 1 }]);
  };
  const qty = (i: number, d: number) => setLines(lines.map((l, j) => (j === i ? { ...l, quantity: Math.max(1, l.quantity + d) } : l)));
  const hasService = lines.some((l) => l.kind === 'SERVICE');

  const save = useMutation({
    mutationFn: () =>
      api.post('/orders', {
        ...(booking ? { bookingId: booking.id } : { barberId: barberId || undefined }),
        items: lines.map((l) => ({ kind: l.kind, id: l.id, quantity: l.quantity })),
        discountCents,
        tipCents,
        payments: payments.map((p, i) => ({ method: p.method, amountCents: paymentCents[i] })).filter((p) => p.amountCents > 0),
      }),
    onSuccess: () => {
      toast.success(`Comanda fechada · ${formatBRL(total)}${change && change > 0 ? ` · troco ${formatBRL(change)}` : ''}`);
      for (const key of ['bookings', 'register', 'orders', 'dashboard', 'products']) queryClient.invalidateQueries({ queryKey: ['admin', key] });
      onClose();
    },
    onError: (e) => {
      const code = (e as AxiosError<{ code?: string }>).response?.data?.code;
      toast.error(apiErrorMessage(e) + (code === 'REGISTER_CLOSED' && user.role !== 'BARBER' ? ' (menu Caixa)' : ''));
    },
  });

  const valid = lines.length > 0 && (!hasService || barberId) && discountCents <= subtotal && paid === total && total > 0;
  const people = (staff ?? []).filter((m) => m.active && m.services.length > 0);

  return (
    <Modal open onClose={onClose} title={booking ? `Cobrar · ${booking.client.name}` : 'Venda avulsa'} size="lg">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {!booking && user.role !== 'BARBER' && (
          <Select label="Quem atendeu (comissão e gorjeta)" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            <option value="">Ninguém (só venda de produto)</option>
            {people.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
          </Select>
        )}
        {booking && <p className="text-xs text-[#8A8680] font-body">Atendimento de <strong className="text-white">{booking.barber.user.name}</strong>. Ao fechar, o agendamento fica concluído.</p>}

        {/* Itens */}
        <div className="space-y-2">
          {lines.length === 0 && <p className="text-xs text-[#5A5650] font-body">Adicione um serviço ou produto.</p>}
          {lines.map((l, i) => (
            <div key={`${l.kind}-${l.id}`} className="flex items-center gap-2 text-sm font-body">
              <span className="flex-1 min-w-0 truncate text-white">{l.name}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => qty(i, -1)} className="p-1 rounded bg-white/5 text-[#8A8680]" aria-label="Menos"><Minus className="w-3 h-3" /></button>
                <span className="w-6 text-center text-white tabular-nums">{l.quantity}</span>
                <button type="button" onClick={() => qty(i, 1)} className="p-1 rounded bg-white/5 text-[#8A8680]" aria-label="Mais"><Plus className="w-3 h-3" /></button>
              </div>
              <span className="w-24 text-right text-[#C8C4BC] tabular-nums">{formatBRL(l.unitPriceCents * l.quantity)}</span>
              <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-1 text-[#5A5650] hover:text-red-400" aria-label={`Remover ${l.name}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Select value="" onChange={(e) => add('SERVICE', e.target.value)} aria-label="Adicionar serviço">
              <option value="">+ Serviço</option>
              {services?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {formatBRL(s.priceCents)}</option>)}
            </Select>
            {products && (
              <Select value="" onChange={(e) => add('PRODUCT', e.target.value)} aria-label="Adicionar produto">
                <option value="">+ Produto</option>
                {products.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stockQuantity === 0}>{p.name} · {formatBRL(p.priceCents)} ({p.stockQuantity} em estoque)</option>
                ))}
              </Select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Desconto (R$)" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00"
            error={discountCents > subtotal ? 'Maior que o subtotal' : undefined} />
          <Input label="Gorjeta (R$)" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0,00" />
        </div>

        <div className="flex items-baseline justify-between border-t border-white/5 pt-3 font-body">
          <span className="text-xs text-[#8A8680]">Subtotal {formatBRL(subtotal)}{discountCents > 0 && ` − ${formatBRL(discountCents)}`}{tipCents > 0 && ` + gorjeta ${formatBRL(tipCents)}`}</span>
          <span className="text-2xl font-display font-bold text-brand-400 tabular-nums">{formatBRL(total)}</span>
        </div>

        {/* Pagamentos */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium tracking-wider uppercase text-[#8A8680] font-body mb-1">Pagamento</legend>
          {payments.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Select value={p.method} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, method: e.target.value as Method } : x)))} aria-label="Forma de pagamento" className="w-36">
                {(Object.keys(PAYMENT_LABEL) as Method[]).map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}
              </Select>
              {single ? (
                <div className="flex-1 px-3 py-2.5 text-sm text-[#C8C4BC] font-body tabular-nums">{formatBRL(total)}</div>
              ) : (
                <input value={p.amount} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" placeholder="0,00" aria-label="Valor"
                  className="flex-1 min-w-0 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-body" />
              )}
              {!single && (
                <button type="button" onClick={() => setPayments(payments.filter((_, j) => j !== i))} className="p-2 text-[#5A5650] hover:text-red-400" aria-label="Remover pagamento">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="text-xs text-brand-400 hover:text-brand-300 font-body"
              onClick={() => setPayments([...payments.map((p, i) => (single && i === 0 ? { ...p, amount: centsToInput(total) } : p)), { method: 'CASH', amount: '' }])}>
              + Dividir em outra forma
            </button>
            {!single && (
              <span className={`text-xs font-body ${paid === total ? 'text-green-400' : 'text-yellow-400'}`}>
                {paid === total ? 'Pagamentos conferem' : `Falta ${formatBRL(total - paid)}`}
              </span>
            )}
          </div>
          {cashOnly && (
            <div className="grid grid-cols-2 gap-3 items-end">
              <Input label="Recebido em dinheiro" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={centsToInput(total)} />
              <p className="pb-2.5 text-sm font-body text-[#C8C4BC]">{change !== null && change >= 0 ? `Troco: ${formatBRL(change)}` : change !== null ? 'Valor menor que o total' : ''}</p>
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {user.role !== 'BARBER' ? <Link to="/admin/caixa" className="text-xs text-[#5A5650] hover:text-brand-400 font-body">Ver caixa</Link> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>Fechar comanda</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
