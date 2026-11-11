import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatInTimeZone } from 'date-fns-tz';
import { Search, Star, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { formatPhone } from '../../utils/format';
import { useSession, isFrontDesk, isManager, BOOKING_STATUS } from './admin';
import { AdminLoading, AdminError, EmptyState, Select, TextArea, Pill } from './shared';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  totalBookings: number;
  lastVisit: string | null;
  isRecurring: boolean;
  createdAt: string;
}

interface ClientDetail extends Client {
  bookings: { id: string; startAt: string; status: string; service: { name: string }; barber: { user: { name: string } } }[];
}

const PAGE_SIZE = 20;

export function ClientsPage() {
  const user = useSession();
  const [search, setSearch] = useState('');
  const [recurring, setRecurring] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{ data: Client[]; pagination: { total: number; totalPages: number } }>({
    queryKey: ['admin', 'clients', search, recurring, page],
    queryFn: async () =>
      (await api.get('/clients', { params: { search: search || undefined, recurring: recurring || undefined, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: keepPreviousData, // não pisca a lista enquanto digita
  });

  const date = (iso: string | null) => (iso ? formatInTimeZone(new Date(iso), user.tenant.timezone, 'dd/MM/yyyy') : '—');

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5650]" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome, telefone ou e-mail"
            aria-label="Buscar cliente"
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-body placeholder:text-[#5A5650] focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
        <Select value={recurring} onChange={(e) => { setRecurring(e.target.value); setPage(1); }} aria-label="Filtro" className="sm:w-48">
          <option value="">Todos os clientes</option>
          <option value="true">Só recorrentes</option>
          <option value="false">Não recorrentes</option>
        </Select>
      </div>

      {isLoading ? (
        <AdminLoading label="clientes" />
      ) : error ? (
        <AdminError message="Erro ao carregar clientes." onRetry={() => refetch()} />
      ) : data?.data.length === 0 ? (
        <EmptyState icon={<UserRound className="w-12 h-12" />}>{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Eles aparecem aqui ao agendar.'}</EmptyState>
      ) : (
        <>
          <ul className="rounded-xl bg-panel border border-white/5 divide-y divide-white/5">
            {data?.data.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpenId(c.id)} className="w-full flex items-center gap-4 px-4 sm:px-6 py-3 text-left hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-white font-body">
                      <span className="truncate">{c.name}</span>
                      {c.isRecurring && <Star className="w-3.5 h-3.5 text-brand-400 shrink-0" aria-label="Recorrente" />}
                    </p>
                    <p className="text-xs text-[#8A8680] font-body">{formatPhone(c.phone)}</p>
                  </div>
                  <div className="text-right text-xs font-body shrink-0">
                    <p className="text-[#C8C4BC]">{c.totalBookings} atendimento(s)</p>
                    <p className="text-[#5A5650]">última: {date(c.lastVisit)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs text-[#8A8680] font-body">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg bg-white/5 disabled:opacity-30" aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
              Página {page} de {data.pagination.totalPages} · {data.pagination.total} clientes
              <button disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg bg-white/5 disabled:opacity-30" aria-label="Próxima página"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}

      {openId && <ClientModal id={openId} canEdit={isFrontDesk(user)} canErase={isManager(user)} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ClientModal({ id, canEdit, canErase, onClose }: { id: string; canEdit: boolean; canErase: boolean; onClose: () => void }) {
  const user = useSession();
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useQuery<ClientDetail>({
    queryKey: ['admin', 'client', id],
    queryFn: async () => (await api.get(`/clients/${id}`)).data.data,
  });

  return (
    <Modal open onClose={onClose} title={client?.name ?? 'Cliente'} size="lg">
      {isLoading || !client ? (
        <AdminLoading label="cliente" />
      ) : (
        <ClientForm
          client={client}
          canEdit={canEdit}
          canErase={canErase}
          tz={user.tenant.timezone}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'client', id] });
          }}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function ClientForm({ client, canEdit, canErase, tz, onSaved, onClose }: {
  client: ClientDetail; canEdit: boolean; canErase: boolean; tz: string; onSaved: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone.startsWith('anon:') ? '' : formatPhone(client.phone));
  const [email, setEmail] = useState(client.email ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');

  const save = useMutation({
    mutationFn: () => api.put(`/clients/${client.id}`, { name, phone, email: email || null, notes: notes || null }),
    onSuccess: () => { toast.success('Cliente atualizado'); onSaved(); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const erase = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/anonymize`),
    onSuccess: () => { toast.success('Dados pessoais removidos'); onSaved(); onClose(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} required minLength={2} />
          <Input label="Telefone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} required />
        </div>
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} />
        <TextArea label="Preferências / observações" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} maxLength={1000}
          placeholder="Ex.: máquina 2 nas laterais, alergia a pomada X" />
        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {canErase ? (
              <Button type="button" variant="danger" size="sm" loading={erase.isPending}
                onClick={() => window.confirm('Apagar os dados pessoais deste cliente (LGPD)? O histórico de atendimentos fica, sem identificação. Não dá para desfazer.') && erase.mutate()}>
                Apagar dados (LGPD)
              </Button>
            ) : <span />}
            <Button type="submit" loading={save.isPending}>Salvar</Button>
          </div>
        )}
      </form>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-[#8A8680] mb-2 font-body">
          Histórico · {client.totalBookings} concluído(s){client.isRecurring && ' · recorrente'}
        </p>
        {client.bookings.length === 0 ? (
          <p className="text-xs text-[#5A5650] font-body">Sem atendimentos.</p>
        ) : (
          <ul className="max-h-56 overflow-y-auto divide-y divide-white/5">
            {client.bookings.map((b) => {
              const st = BOOKING_STATUS[b.status];
              return (
                <li key={b.id} className="flex items-center gap-3 py-2 text-xs font-body">
                  <span className="text-white tabular-nums w-28 shrink-0">{formatInTimeZone(new Date(b.startAt), tz, 'dd/MM/yy HH:mm')}</span>
                  <span className="text-[#C8C4BC] flex-1 truncate">{b.service.name} · {b.barber.user.name}</span>
                  <Pill className={st.className}>{st.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
