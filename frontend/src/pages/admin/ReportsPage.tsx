import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '../../config/api';
import { formatBRL } from '../../utils/format';
import { downloadCsv, csvMoney } from '../../utils/csv';
import { useSession, PAYMENT_LABEL, presets, type Period } from './admin';
import { AdminLoading, AdminError } from './shared';
import { PeriodPicker } from './PeriodPicker';

interface Report {
  orders: number;
  grossCents: number;
  discountCents: number;
  revenueCents: number;
  tipsCents: number;
  receivedCents: number;
  averageTicketCents: number;
  byMethod: Record<keyof typeof PAYMENT_LABEL, number>;
  byBarber: { barberId: string; name: string; revenueCents: number; services: number; commissionCents: number; tipsCents: number }[];
  topServices: { name: string; quantity: number; revenueCents: number }[];
  topProducts: { name: string; quantity: number; revenueCents: number }[];
  byDay: { day: string; orders: number; revenueCents: number }[];
  bookings: { completed: number; noShow: number; cancelled: number; noShowRate: number };
  clients: { new: number; served: number; recurringServed: number };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const br = (d: string) => d.split('-').reverse().join('/');

export function ReportsPage() {
  const user = useSession();
  const [period, setPeriod] = useState<Period>(() => presets(user.tenant.timezone)[2].period); // este mês
  const { data: r, isLoading, error, refetch, isFetching } = useQuery<Report>({
    queryKey: ['admin', 'reports', period],
    queryFn: async () => (await api.get('/reports', { params: period })).data.data,
    placeholderData: keepPreviousData,
  });
  const suffix = `${period.from}_a_${period.to}`;

  return (
    <div className="space-y-6 animate-fade">
      <PeriodPicker tz={user.tenant.timezone} value={period} onChange={setPeriod} />

      {isLoading ? (
        <AdminLoading label="relatório" />
      ) : error || !r ? (
        <AdminError message="Erro ao carregar o relatório." onRetry={() => refetch()} />
      ) : (
        <div className={`space-y-6 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card label="Faturamento" value={formatBRL(r.revenueCents)} hint={`${r.orders} comanda(s) · descontos ${formatBRL(r.discountCents)}`} />
            <Card label="Ticket médio" value={formatBRL(r.averageTicketCents)} hint={`gorjetas ${formatBRL(r.tipsCents)}`} />
            <Card label="Clientes atendidos" value={String(r.clients.served)} hint={`${r.clients.recurringServed} recorrentes · ${r.clients.new} novos cadastros`} />
            <Card label="Faltas" value={pct(r.bookings.noShowRate)} hint={`${r.bookings.noShow} falta(s) · ${r.bookings.cancelled} cancelado(s)`} />
          </div>

          <Table
            title="Formas de pagamento"
            head={['Forma', 'Recebido']}
            rows={(Object.keys(PAYMENT_LABEL) as (keyof typeof PAYMENT_LABEL)[]).map((m) => [PAYMENT_LABEL[m], formatBRL(r.byMethod[m])])}
            onCsv={() => downloadCsv(`pagamentos_${suffix}.csv`, [['Forma', 'Recebido'], ...Object.entries(PAYMENT_LABEL).map(([m, l]) => [l, csvMoney(r.byMethod[m as keyof typeof PAYMENT_LABEL])])])}
          />

          <Table
            title="Por profissional"
            head={['Profissional', 'Serviços', 'Faturamento', 'Comissão', 'Gorjetas']}
            rows={r.byBarber.map((b) => [b.name, String(b.services), formatBRL(b.revenueCents), formatBRL(b.commissionCents), formatBRL(b.tipsCents)])}
            onCsv={() => downloadCsv(`profissionais_${suffix}.csv`, [
              ['Profissional', 'Serviços', 'Faturamento', 'Comissão', 'Gorjetas'],
              ...r.byBarber.map((b) => [b.name, b.services, csvMoney(b.revenueCents), csvMoney(b.commissionCents), csvMoney(b.tipsCents)]),
            ])}
          />

          <div className="grid lg:grid-cols-2 gap-6">
            <Table
              title="Serviços mais vendidos"
              head={['Serviço', 'Qtd', 'Faturamento']}
              rows={r.topServices.map((s) => [s.name, String(s.quantity), formatBRL(s.revenueCents)])}
              onCsv={() => downloadCsv(`servicos_${suffix}.csv`, [['Serviço', 'Quantidade', 'Faturamento'], ...r.topServices.map((s) => [s.name, s.quantity, csvMoney(s.revenueCents)])])}
            />
            <Table
              title="Produtos mais vendidos"
              head={['Produto', 'Qtd', 'Faturamento']}
              rows={r.topProducts.map((s) => [s.name, String(s.quantity), formatBRL(s.revenueCents)])}
              onCsv={() => downloadCsv(`produtos_${suffix}.csv`, [['Produto', 'Quantidade', 'Faturamento'], ...r.topProducts.map((s) => [s.name, s.quantity, csvMoney(s.revenueCents)])])}
            />
          </div>

          <Table
            title="Por dia"
            head={['Dia', 'Comandas', 'Faturamento']}
            rows={r.byDay.map((d) => [br(d.day), String(d.orders), formatBRL(d.revenueCents)])}
            onCsv={() => downloadCsv(`diario_${suffix}.csv`, [['Dia', 'Comandas', 'Faturamento'], ...r.byDay.map((d) => [br(d.day), d.orders, csvMoney(d.revenueCents)])])}
          />
          <p className="text-[11px] text-[#5A5650] font-body">Faturamento = serviços e produtos com desconto, sem gorjeta. Comandas estornadas não entram.</p>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-4 sm:p-5 rounded-xl bg-panel border border-white/5">
      <p className="text-[11px] uppercase tracking-wider text-[#8A8680] font-body">{label}</p>
      <p className="text-2xl font-display font-bold text-white tabular-nums mt-1">{value}</p>
      <p className="text-[11px] text-[#5A5650] font-body mt-1">{hint}</p>
    </div>
  );
}

function Table({ title, head, rows, onCsv }: { title: string; head: string[]; rows: string[][]; onCsv: () => void }) {
  return (
    <section className="rounded-xl bg-panel border border-white/5">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/5">
        <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">{title}</h3>
        <button onClick={onCsv} disabled={rows.length === 0} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-30 font-body">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-xs text-[#5A5650] font-body text-center">Sem dados no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[#8A8680]">
                {head.map((h, i) => <th key={h} className={`px-4 sm:px-6 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => <td key={j} className={`px-4 sm:px-6 py-2 ${j ? 'text-right tabular-nums text-[#C8C4BC]' : 'text-white'}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
