import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, BadgePercent } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button } from '../../components/ui';
import { formatBRL } from '../../utils/format';
import { downloadCsv, csvMoney } from '../../utils/csv';
import { useSession, isManager, presets, type Period } from './admin';
import { AdminLoading, AdminError, EmptyState } from './shared';
import { PeriodPicker } from './PeriodPicker';

interface Row { barberId: string; name: string; pendingCents: number; paidCents: number; servicesCents: number; productsCents: number }

export function CommissionsPage() {
  const user = useSession();
  const manager = isManager(user);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>(() => presets(user.tenant.timezone)[2].period);
  const { data, isLoading, error, refetch } = useQuery<Row[]>({
    queryKey: ['admin', 'commissions', period],
    queryFn: async () => (await api.get('/commissions', { params: period })).data.data,
  });

  const pay = useMutation({
    mutationFn: (barberId: string) => api.post('/commissions/pay', { barberId, ...period }),
    onSuccess: (r) => {
      toast.success(`Comissão de ${formatBRL(r.data.data.amountCents)} marcada como paga`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const csv = () =>
    downloadCsv(`comissoes_${period.from}_a_${period.to}.csv`, [
      ['Profissional', 'Serviços', 'Produtos', 'A pagar', 'Pago'],
      ...(data ?? []).map((r) => [r.name, csvMoney(r.servicesCents), csvMoney(r.productsCents), csvMoney(r.pendingCents), csvMoney(r.paidCents)]),
    ]);

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <PeriodPicker tz={user.tenant.timezone} value={period} onChange={setPeriod} />
        <button onClick={csv} disabled={!data?.length} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-30 font-body self-end">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>
      <p className="text-xs text-[#8A8680] font-body">
        Comissão = % do profissional sobre o valor pago (com desconto). Gorjetas são 100% do profissional e aparecem no relatório.
        {manager && ' Ajuste os percentuais em Equipe.'}
      </p>

      {isLoading ? (
        <AdminLoading label="comissões" />
      ) : error ? (
        <AdminError message="Erro ao carregar comissões." onRetry={() => refetch()} />
      ) : data?.length === 0 ? (
        <EmptyState icon={<BadgePercent className="w-12 h-12" />}>Nenhuma comissão no período.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data?.map((r) => (
            <li key={r.barberId} className="p-5 rounded-xl bg-panel border border-white/5 space-y-3">
              <h4 className="text-sm font-display font-semibold text-white">{r.name}</h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-body">
                <span className="text-[#8A8680]">Serviços</span><span className="text-right text-[#C8C4BC] tabular-nums">{formatBRL(r.servicesCents)}</span>
                <span className="text-[#8A8680]">Produtos</span><span className="text-right text-[#C8C4BC] tabular-nums">{formatBRL(r.productsCents)}</span>
                <span className="text-[#8A8680]">Já pago</span><span className="text-right text-green-400 tabular-nums">{formatBRL(r.paidCents)}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#8A8680] font-body">A pagar</p>
                  <p className="text-xl font-display font-bold text-brand-400 tabular-nums">{formatBRL(r.pendingCents)}</p>
                </div>
                {manager && r.pendingCents > 0 && (
                  <Button size="sm" loading={pay.isPending && pay.variables === r.barberId}
                    onClick={() => window.confirm(`Marcar ${formatBRL(r.pendingCents)} como pago para ${r.name}?`) && pay.mutate(r.barberId)}>
                    Marcar pago
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
