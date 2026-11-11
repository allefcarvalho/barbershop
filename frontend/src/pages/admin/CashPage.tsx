import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatInTimeZone } from 'date-fns-tz';
import { Wallet, ShoppingBag, ArrowDownToLine, ArrowUpFromLine, Lock, Receipt } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { formatBRL, parseBRL } from '../../utils/format';
import { useSession, isManager, PAYMENT_LABEL } from './admin';
import { AdminLoading, AdminError, EmptyState, Pill } from './shared';
import { CheckoutModal } from './CheckoutModal';

interface Register {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingCents: number;
  openedByName: string;
  orders: number;
  totalCents: number;
  tipsCents: number;
  byMethod: Record<keyof typeof PAYMENT_LABEL, number>;
  depositsCents: number;
  withdrawalsCents: number;
  expectedCashCents: number;
  countedCashCents: number | null;
  differenceCents: number | null;
  movements: { id: string; type: 'DEPOSIT' | 'WITHDRAWAL'; amountCents: number; reason: string; createdAt: string }[];
}

interface Order {
  id: string;
  createdAt: string;
  status: 'PAID' | 'VOIDED';
  totalCents: number;
  tipCents: number;
  discountCents: number;
  voidReason: string | null;
  client: { name: string } | null;
  barber: { user: { name: string } } | null;
  items: { id: string; description: string; quantity: number }[];
  payments: { method: keyof typeof PAYMENT_LABEL; amountCents: number }[];
}

export function CashPage() {
  const user = useSession();
  const { data: register, isLoading, error, refetch } = useQuery<Register | null>({
    queryKey: ['admin', 'register'],
    queryFn: async () => (await api.get('/register')).data.data,
    refetchInterval: 30_000,
  });

  if (isLoading) return <AdminLoading label="caixa" />;
  if (error) return <AdminError message="Erro ao carregar o caixa." onRetry={() => refetch()} />;

  return (
    <div className="space-y-8 animate-fade">
      {register ? <OpenRegister register={register} /> : <OpenForm />}
      {isManager(user) && <History />}
    </div>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['register', 'orders', 'dashboard']) queryClient.invalidateQueries({ queryKey: ['admin', key] });
  };
}

function OpenForm() {
  const refresh = useRefresh();
  const [opening, setOpening] = useState('');
  const open = useMutation({
    mutationFn: () => api.post('/register/open', { openingCents: parseBRL(opening) ?? 0 }),
    onSuccess: () => { toast.success('Caixa aberto'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <form className="max-w-md p-6 rounded-xl bg-panel border border-white/5 space-y-4" onSubmit={(e) => { e.preventDefault(); open.mutate(); }}>
      <div className="flex items-center gap-3">
        <Lock className="w-5 h-5 text-brand-400" />
        <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">Caixa fechado</h3>
      </div>
      <p className="text-xs text-[#8A8680] font-body">Abra o caixa para poder cobrar comandas. Informe o dinheiro que já está na gaveta (troco).</p>
      <Input label="Dinheiro na gaveta (R$)" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" />
      <Button type="submit" loading={open.isPending} fullWidth>Abrir caixa</Button>
    </form>
  );
}

function OpenRegister({ register: r }: { register: Register }) {
  const user = useSession();
  const tz = user.tenant.timezone;
  const [modal, setModal] = useState<'sale' | 'DEPOSIT' | 'WITHDRAWAL' | 'close' | null>(null);
  const { data: orders } = useQuery<Order[]>({
    queryKey: ['admin', 'orders', r.id],
    queryFn: async () => (await api.get('/orders', { params: { registerId: r.id } })).data.data,
  });

  const cards = [
    { label: 'Total recebido', value: formatBRL(r.totalCents), hint: `${r.orders} comanda(s) · gorjetas ${formatBRL(r.tipsCents)}` },
    { label: 'Dinheiro na gaveta', value: formatBRL(r.expectedCashCents), hint: `abertura ${formatBRL(r.openingCents)} · +${formatBRL(r.depositsCents)} −${formatBRL(r.withdrawalsCents)}` },
    ...(Object.keys(PAYMENT_LABEL) as (keyof typeof PAYMENT_LABEL)[])
      .filter((m) => m !== 'CASH')
      .map((m) => ({ label: PAYMENT_LABEL[m], value: formatBRL(r.byMethod[m]), hint: '' })),
  ];

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-[#8A8680] font-body">
          Caixa aberto por <strong className="text-white">{r.openedByName}</strong> às {formatInTimeZone(new Date(r.openedAt), tz, "HH:mm 'de' dd/MM")}
        </p>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Button size="sm" onClick={() => setModal('sale')}><ShoppingBag className="w-3.5 h-3.5" /> Venda avulsa</Button>
          <Button size="sm" variant="secondary" onClick={() => setModal('DEPOSIT')}><ArrowDownToLine className="w-3.5 h-3.5" /> Suprimento</Button>
          <Button size="sm" variant="secondary" onClick={() => setModal('WITHDRAWAL')}><ArrowUpFromLine className="w-3.5 h-3.5" /> Sangria</Button>
          <Button size="sm" variant="danger" onClick={() => setModal('close')}><Lock className="w-3.5 h-3.5" /> Fechar caixa</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="p-4 rounded-xl bg-panel border border-white/5">
            <p className="text-[11px] uppercase tracking-wider text-[#8A8680] font-body">{c.label}</p>
            <p className="text-xl font-display font-bold text-white tabular-nums mt-1">{c.value}</p>
            {c.hint && <p className="text-[11px] text-[#5A5650] font-body mt-1">{c.hint}</p>}
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">Comandas deste caixa</h3>
        {orders?.length === 0 ? (
          <EmptyState icon={<Receipt className="w-12 h-12" />}>Nenhuma comanda ainda. Cobre pela agenda ou faça uma venda avulsa.</EmptyState>
        ) : (
          <ul className="rounded-xl bg-panel border border-white/5 divide-y divide-white/5">
            {orders?.map((o) => <OrderRow key={o.id} order={o} tz={tz} canVoid={isManager(user)} />)}
          </ul>
        )}
      </section>

      {r.movements.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">Suprimentos e sangrias</h3>
          <ul className="text-xs font-body divide-y divide-white/5 rounded-xl bg-panel border border-white/5">
            {r.movements.map((m) => (
              <li key={m.id} className="flex gap-3 px-4 py-2">
                <span className="text-[#5A5650] tabular-nums">{formatInTimeZone(new Date(m.createdAt), tz, 'HH:mm')}</span>
                <span className={m.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'}>{m.type === 'DEPOSIT' ? '+' : '−'}{formatBRL(m.amountCents)}</span>
                <span className="text-[#C8C4BC] truncate">{m.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modal === 'sale' && <CheckoutModal onClose={() => setModal(null)} />}
      {(modal === 'DEPOSIT' || modal === 'WITHDRAWAL') && <MovementModal type={modal} onClose={() => setModal(null)} />}
      {modal === 'close' && <CloseModal register={r} onClose={() => setModal(null)} />}
    </>
  );
}

function OrderRow({ order: o, tz, canVoid }: { order: Order; tz: string; canVoid: boolean }) {
  const refresh = useRefresh();
  const voidIt = useMutation({
    mutationFn: (reason: string) => api.post(`/orders/${o.id}/void`, { reason }),
    onSuccess: () => { toast.success('Comanda estornada'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const voided = o.status === 'VOIDED';
  return (
    <li className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 sm:px-6 py-3 ${voided ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-body truncate">
          <span className="text-[#5A5650] tabular-nums mr-2">{formatInTimeZone(new Date(o.createdAt), tz, 'HH:mm')}</span>
          {o.client?.name ?? 'Venda no balcão'}{o.barber && <span className="text-[#8A8680]"> · {o.barber.user.name}</span>}
        </p>
        <p className="text-xs text-[#8A8680] font-body truncate">
          {o.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.description}`).join(', ')}
          {' · '}{o.payments.map((p) => PAYMENT_LABEL[p.method]).join(' + ')}
          {voided && o.voidReason && ` · estorno: ${o.voidReason}`}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <span className={`text-sm font-semibold font-body tabular-nums ${voided ? 'line-through text-[#5A5650]' : 'text-brand-400'}`}>{formatBRL(o.totalCents)}</span>
        {voided ? (
          <Pill className="bg-red-500/10 text-red-400 border-red-500/20">Estornada</Pill>
        ) : (
          canVoid && (
            <button className="text-xs text-[#5A5650] hover:text-red-400 font-body" onClick={() => {
              const reason = window.prompt('Motivo do estorno:');
              if (reason && reason.trim().length >= 3) voidIt.mutate(reason.trim());
            }}>
              Estornar
            </button>
          )
        )}
      </div>
    </li>
  );
}

function MovementModal({ type, onClose }: { type: 'DEPOSIT' | 'WITHDRAWAL'; onClose: () => void }) {
  const refresh = useRefresh();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/register/movements', { type, amountCents: parseBRL(amount), reason }),
    onSuccess: () => { toast.success(type === 'DEPOSIT' ? 'Suprimento registrado' : 'Sangria registrada'); refresh(); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={type === 'DEPOSIT' ? 'Suprimento (colocar dinheiro)' : 'Sangria (retirar dinheiro)'} size="sm">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Input label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200}
          placeholder={type === 'DEPOSIT' ? 'Ex.: troco' : 'Ex.: depósito no banco, pagamento de fornecedor'} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" loading={save.isPending} disabled={!parseBRL(amount)}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}

function CloseModal({ register: r, onClose }: { register: Register; onClose: () => void }) {
  const refresh = useRefresh();
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const countedCents = parseBRL(counted);
  const diff = countedCents === null ? null : countedCents - r.expectedCashCents;
  const close = useMutation({
    mutationFn: () => api.post('/register/close', { countedCashCents: countedCents, notes: notes || undefined }),
    onSuccess: () => { toast.success('Caixa fechado'); refresh(); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="Fechar caixa" size="sm">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); close.mutate(); }}>
        <p className="text-sm text-[#C8C4BC] font-body">Conte o dinheiro da gaveta. O sistema espera <strong className="text-white">{formatBRL(r.expectedCashCents)}</strong>.</p>
        <Input label="Dinheiro contado (R$)" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} required />
        {diff !== null && (
          <p className={`text-sm font-body ${diff === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {diff === 0 ? 'Caixa confere.' : diff > 0 ? `Sobra de ${formatBRL(diff)}` : `Falta de ${formatBRL(-diff)}`}
          </p>
        )}
        <Input label="Observação (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" variant="danger" loading={close.isPending} disabled={countedCents === null}>Fechar caixa</Button>
        </div>
      </form>
    </Modal>
  );
}

function History() {
  const user = useSession();
  const { data } = useQuery<Register[]>({
    queryKey: ['admin', 'register', 'history'],
    queryFn: async () => (await api.get('/register/history')).data.data,
  });
  if (!data?.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white uppercase tracking-wider"><Wallet className="w-4 h-4 text-brand-400" /> Caixas anteriores</h3>
      <div className="overflow-x-auto rounded-xl bg-panel border border-white/5">
        <table className="w-full text-xs font-body">
          <thead className="text-[#8A8680] text-left">
            <tr className="border-b border-white/5">
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium text-right">Comandas</th>
              <th className="px-4 py-2 font-medium text-right">Recebido</th>
              <th className="px-4 py-2 font-medium text-right">Esperado em dinheiro</th>
              <th className="px-4 py-2 font-medium text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-[#C8C4BC]">
            {data.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 whitespace-nowrap">{formatInTimeZone(new Date(r.openedAt), user.tenant.timezone, 'dd/MM/yy HH:mm')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.orders}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatBRL(r.totalCents)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatBRL(r.expectedCashCents)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${r.differenceCents ? 'text-yellow-400' : 'text-green-400'}`}>{formatBRL(r.differenceCents ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
