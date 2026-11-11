import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatInTimeZone } from 'date-fns-tz';
import { MessageCircle, RotateCw } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { formatPhone } from '../../utils/format';
import { useSession } from './admin';
import { AdminLoading, AdminError, EmptyState, Select, Pill } from './shared';

interface Notification {
  id: string;
  type: 'CONFIRMATION' | 'REMINDER' | 'CANCELLATION' | 'WAITLIST' | 'MESSAGE';
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  channel: 'INTERNAL' | 'WHATSAPP' | 'SMS';
  scheduledFor: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  client: { name: string; phone: string };
  booking: { startAt: string; service: { name: string } } | null;
}

const TYPE = { CONFIRMATION: 'Confirmação', REMINDER: 'Lembrete', CANCELLATION: 'Cancelamento', WAITLIST: 'Vaga (lista de espera)', MESSAGE: 'Resposta' };
const STATUS = {
  PENDING: { label: 'Na fila', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  SENT: { label: 'Enviada', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
  FAILED: { label: 'Falhou', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  SKIPPED: { label: 'Não enviada', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
};

export function MessagesPage() {
  const user = useSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useQuery<Notification[]>({
    queryKey: ['admin', 'notifications', status],
    queryFn: async () => (await api.get('/notifications', { params: { status: status || undefined, pageSize: 100 } })).data.data,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/retry`),
    onSuccess: () => { toast.success('Colocada na fila de novo'); queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] }); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const at = (iso: string) => formatInTimeZone(new Date(iso), user.tenant.timezone, 'dd/MM HH:mm');

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-[#8A8680] font-body">Mensagens automáticas para os clientes. Lembretes ficam na fila até a hora de enviar.</p>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação" className="sm:w-48">
          <option value="">Todas</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <AdminLoading label="mensagens" />
      ) : error ? (
        <AdminError message="Erro ao carregar mensagens." onRetry={() => refetch()} />
      ) : data?.length === 0 ? (
        <EmptyState icon={<MessageCircle className="w-12 h-12" />}>Nenhuma mensagem.</EmptyState>
      ) : (
        <ul className="rounded-xl bg-panel border border-white/5 divide-y divide-white/5">
          {data?.map((n) => {
            const st = STATUS[n.status];
            return (
              <li key={n.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 sm:px-6 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-body truncate">
                    {TYPE[n.type]} · {n.client.name} <span className="text-[#5A5650]">{formatPhone(n.client.phone)}</span>
                  </p>
                  <p className="text-xs text-[#8A8680] font-body truncate">
                    {n.booking && `${n.booking.service.name} em ${at(n.booking.startAt)} · `}
                    {n.status === 'SENT' && n.sentAt ? `enviada ${at(n.sentAt)} ${n.channel === 'WHATSAPP' ? 'pelo WhatsApp' : '(registro interno)'}` : `programada para ${at(n.scheduledFor)}`}
                  </p>
                  {n.lastError && n.status !== 'SENT' && <p className="text-xs text-red-400/80 font-body truncate">{n.lastError}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Pill className={st.className}>{st.label}</Pill>
                  {(n.status === 'FAILED' || n.status === 'SKIPPED') && (
                    <button onClick={() => retry.mutate(n.id)} className="p-1.5 text-[#5A5650] hover:text-brand-400" aria-label="Reenviar">
                      <RotateCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
