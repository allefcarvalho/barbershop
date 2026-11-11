import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, CheckCircle2, Wallet, UserX, Package, Clock, ArrowRight, BellRing } from 'lucide-react';
import { api } from '../../config/api';
import { formatBRL } from '../../utils/format';
import { useSession, weekdayLabel, BOOKING_STATUS } from './admin';
import { AdminLoading, AdminError, Pill } from './shared';

interface Dashboard {
  date: string;
  today: { total: number; completed: number; remaining: number; noShow: number; cancelled: number; expectedCents: number; completedCents: number };
  pendingConfirmation: number;
  month: { completed: number; noShowRate: number };
  lowStock: number | null;
  upcoming: { id: string; time: string; client: string; service: string; barber: string; status: string }[];
}

export function DashboardPage() {
  const user = useSession();
  const { data, isLoading, error, refetch } = useQuery<Dashboard>({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data.data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <AdminLoading label="resumo do dia" />;
  if (error || !data) return <AdminError message="Erro ao carregar o resumo." onRetry={() => refetch()} />;

  const t = data.today;
  const stats = [
    { label: 'Atendimentos hoje', value: t.total, hint: `${t.remaining} a fazer · ${t.completed} feitos`, icon: Calendar },
    { label: 'Faturamento do dia', value: formatBRL(t.completedCents), hint: `previsto ${formatBRL(t.expectedCents)}`, icon: Wallet },
    { label: 'Concluídos no mês', value: data.month.completed, hint: `${Math.round(data.month.noShowRate * 100)}% de faltas no mês`, icon: CheckCircle2 },
    { label: 'Faltas hoje', value: t.noShow, hint: `${t.cancelled} cancelado(s)`, icon: UserX },
  ];

  return (
    <div className="space-y-6 animate-fade">
      <p className="text-sm text-[#8A8680] font-body first-letter:uppercase">
        {weekdayLabel(data.date)} · olá, {user.name.split(' ')[0]}
      </p>

      {(data.pendingConfirmation > 0 || (data.lowStock ?? 0) > 0) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {data.pendingConfirmation > 0 && (
            <Link to="/admin/agenda" className="flex-1 flex items-center gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-400 text-sm font-body hover:bg-yellow-500/10">
              <BellRing className="w-4 h-4 shrink-0" /> {data.pendingConfirmation} agendamento(s) aguardando confirmação
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Link>
          )}
          {(data.lowStock ?? 0) > 0 && (
            <Link to="/admin/produtos" className="flex-1 flex items-center gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-400 text-sm font-body hover:bg-yellow-500/10">
              <Package className="w-4 h-4 shrink-0" /> {data.lowStock} produto(s) com estoque baixo
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-4 sm:p-5 rounded-xl bg-panel border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-[11px] uppercase tracking-wider text-[#8A8680] font-body">{s.label}</span>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-bold text-white tabular-nums">{s.value}</p>
              <p className="mt-1 text-xs text-[#5A5650] font-body">{s.hint}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl bg-panel border border-white/5">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/5">
          <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">Próximos de hoje</h3>
          <Link to="/admin/agenda" className="text-xs text-brand-400 hover:text-brand-300 font-body">Ver agenda</Link>
        </div>
        {data.upcoming.length === 0 ? (
          <p className="px-6 py-8 text-sm text-[#5A5650] font-body text-center">Nenhum atendimento restante hoje.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.upcoming.map((b) => {
              const st = BOOKING_STATUS[b.status];
              return (
                <li key={b.id} className="flex items-center gap-4 px-4 sm:px-6 py-3">
                  <span className="flex items-center gap-1.5 w-16 shrink-0 text-sm font-semibold text-brand-400 font-body tabular-nums">
                    <Clock className="w-3.5 h-3.5" /> {b.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-body truncate">{b.client}</p>
                    <p className="text-xs text-[#8A8680] font-body truncate">{b.service} · {b.barber}</p>
                  </div>
                  <Pill className={st.className}>{st.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
