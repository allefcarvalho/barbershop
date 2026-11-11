import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import toast from 'react-hot-toast';
import { Calendar, ChevronLeft, ChevronRight, Plus, Zap, Star, Phone, CalendarClock } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { formatBRL, formatPhone } from '../../utils/format';
import { useSession, useStaff, useAdminServices, isFrontDesk, shiftDate, weekdayLabel, BOOKING_STATUS } from './admin';
import { AdminLoading, AdminError, EmptyState, Select, TextArea, Pill } from './shared';

interface Booking {
  id: string;
  startAt: string;
  endAt: string;
  status: keyof typeof BOOKING_STATUS;
  source: 'ONLINE' | 'PANEL' | 'WALK_IN';
  priceCents: number;
  notes: string | null;
  client: { id: string; name: string; phone: string; isRecurring: boolean };
  barber: { id: string; user: { name: string } };
  service: { id: string; name: string };
}

const SOURCE_LABEL = { ONLINE: 'Online', PANEL: 'Painel', WALK_IN: 'Encaixe' };

type FormMode = { kind: 'new' } | { kind: 'walkin' } | { kind: 'reschedule'; booking: Booking };

export function AgendaPage() {
  const user = useSession();
  const tz = user.tenant.timezone;
  const [date, setDate] = useState(() => formatInTimeZone(new Date(), tz, 'yyyy-MM-dd'));
  const [barberId, setBarberId] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<FormMode | null>(null);
  const { data: staff } = useStaff();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<Booking[]>({
    queryKey: ['admin', 'bookings', date, barberId, status],
    queryFn: async () =>
      (await api.get('/bookings', { params: { date, barberId: barberId || undefined, status: status || undefined, pageSize: 200 } })).data.data,
    refetchInterval: 30_000, // agenda "viva": vê agendamentos online sem recarregar
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/bookings/${id}/status`, { status }),
    onSuccess: (_r, v) => {
      toast.success(`Marcado como ${BOOKING_STATUS[v.status].label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const act = (b: Booking, next: string) => {
    if (next === 'CANCELLED' && !window.confirm(`Cancelar o horário de ${b.client.name}?`)) return;
    changeStatus.mutate({ id: b.id, status: next });
  };

  const bookings = data ?? [];
  const live = bookings.filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW');
  const summary = {
    count: live.length,
    done: bookings.filter((b) => b.status === 'COMPLETED').length,
    expected: live.reduce((s, b) => s + b.priceCents, 0),
  };

  const today = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
  const bookableStaff = (staff ?? []).filter((m) => m.active && m.services.length > 0);
  const time = (iso: string) => formatInTimeZone(new Date(iso), tz, 'HH:mm');

  return (
    <div className="space-y-6 animate-fade">
      {/* Barra de controle */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(shiftDate(date, -1))} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#8A8680]" aria-label="Dia anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-body [color-scheme:dark]"
            aria-label="Data"
          />
          <button onClick={() => setDate(shiftDate(date, 1))} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#8A8680]" aria-label="Próximo dia">
            <ChevronRight className="w-4 h-4" />
          </button>
          {date !== today && (
            <button onClick={() => setDate(today)} className="px-3 py-2 text-xs uppercase tracking-wider text-brand-400 hover:text-brand-300 font-body">
              Hoje
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {isFrontDesk(user) && (
            <Select value={barberId} onChange={(e) => setBarberId(e.target.value)} aria-label="Barbeiro" className="sm:w-48">
              <option value="">Todos os barbeiros</option>
              {bookableStaff.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
            </Select>
          )}
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-40">
            <option value="">Todos os status</option>
            {Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Button size="sm" variant="secondary" onClick={() => setForm({ kind: 'walkin' })} className="!py-2.5">
            <Zap className="w-3.5 h-3.5" /> Encaixe
          </Button>
          <Button size="sm" onClick={() => setForm({ kind: 'new' })} className="!py-2.5">
            <Plus className="w-3.5 h-3.5" /> Agendar
          </Button>
        </div>
      </div>

      {/* Resumo do dia */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-display font-semibold text-white first-letter:uppercase">{weekdayLabel(date)}</h3>
        <p className="text-xs text-[#8A8680] font-body">
          {summary.count} atendimento(s) · {summary.done} concluído(s) · previsto {formatBRL(summary.expected)}
        </p>
      </div>

      {isLoading ? (
        <AdminLoading label="agenda" />
      ) : error ? (
        <AdminError message="Erro ao carregar a agenda." onRetry={() => refetch()} />
      ) : bookings.length === 0 ? (
        <EmptyState icon={<Calendar className="w-12 h-12" />}>Nenhum agendamento neste dia.</EmptyState>
      ) : (
        <ul className="rounded-xl bg-panel border border-white/5 divide-y divide-white/5">
          {bookings.map((b) => {
            const st = BOOKING_STATUS[b.status];
            const open = b.status === 'PENDING' || b.status === 'CONFIRMED';
            return (
              <li key={b.id} className="flex flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-sm font-semibold text-brand-400 font-body tabular-nums">{time(b.startAt)}</p>
                    <p className="text-[11px] text-[#5A5650] font-body tabular-nums">{time(b.endAt)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-white font-body">
                      <span className="truncate">{b.client.name}</span>
                      {b.client.isRecurring && <Star className="w-3.5 h-3.5 text-brand-400 shrink-0" aria-label="Cliente recorrente" />}
                    </p>
                    <p className="text-xs text-[#8A8680] font-body truncate">
                      {b.service.name} · {b.barber.user.name} · {formatBRL(b.priceCents)}
                    </p>
                    <a href={`tel:${b.client.phone}`} className="inline-flex items-center gap-1 text-xs text-[#5A5650] hover:text-brand-400 font-body">
                      <Phone className="w-3 h-3" /> {formatPhone(b.client.phone)}
                    </a>
                    {b.notes && <p className="text-xs text-[#8A8680] italic mt-1 font-body">{b.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Pill className={st.className}>{st.label}</Pill>
                    <span className="text-[10px] uppercase tracking-wider text-[#5A5650] font-body">{SOURCE_LABEL[b.source]}</span>
                  </div>
                </div>

                {open && (
                  <div className="flex flex-wrap gap-2 md:justify-end md:w-72">
                    {b.status === 'PENDING' && <Button size="sm" onClick={() => act(b, 'CONFIRMED')}>Confirmar</Button>}
                    {b.status === 'CONFIRMED' && <Button size="sm" onClick={() => act(b, 'COMPLETED')}>Concluir</Button>}
                    {b.status === 'CONFIRMED' && <Button size="sm" variant="secondary" onClick={() => act(b, 'NO_SHOW')}>Não veio</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setForm({ kind: 'reschedule', booking: b })} aria-label="Remarcar">
                      <CalendarClock className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => act(b, 'CANCELLED')}>Cancelar</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {form && <BookingForm mode={form} date={date} onClose={() => setForm(null)} />}
    </div>
  );
}

// ===== Formulário: novo agendamento, encaixe e remarcação =====

function BookingForm({ mode, date: initialDate, onClose }: { mode: FormMode; date: string; onClose: () => void }) {
  const user = useSession();
  const { data: staff } = useStaff();
  const { data: services } = useAdminServices();
  const queryClient = useQueryClient();
  const editing = mode.kind === 'reschedule' ? mode.booking : null;

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState(editing?.service.id ?? '');
  const [barberId, setBarberId] = useState(editing?.barber.id ?? (user.role === 'BARBER' ? user.membershipId : ''));
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  const activeServices = (services ?? []).filter((s) => s.active);
  const barbers = (staff ?? []).filter(
    (m) => m.active && m.services.some((s) => s.service.id === serviceId) && (user.role !== 'BARBER' || m.id === user.membershipId),
  );

  // Cliente já cadastrado? Preenche o nome a partir do telefone.
  const digits = phone.replace(/\D/g, '');
  const { data: found } = useQuery({
    queryKey: ['admin', 'client-lookup', digits],
    queryFn: async () => (await api.get('/clients', { params: { search: digits, pageSize: 1 } })).data.data[0] as { name: string; phone: string } | undefined,
    enabled: !editing && digits.length >= 10,
  });

  // Sugestões de horário livre (mesmo motor do site). A equipe pode digitar outro horário.
  const { data: slots } = useQuery<{ time: string }[]>({
    queryKey: ['admin', 'slots', barberId, date, serviceId],
    queryFn: async () => (await api.get(`/public/${user.tenant.slug}/barbers/${barberId}/slots`, { params: { date, serviceId } })).data.data,
    enabled: mode.kind !== 'walkin' && !!barberId && !!serviceId && !!date,
  });

  const save = useMutation({
    mutationFn: () => {
      if (editing) return api.patch(`/bookings/${editing.id}/reschedule`, { date, time, barberId });
      return api.post('/bookings', {
        clientName: name || found?.name,
        clientPhone: phone,
        serviceId,
        barberId,
        notes: notes || undefined,
        ...(mode.kind === 'walkin' ? { walkIn: true } : { date, time }),
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Agendamento remarcado' : mode.kind === 'walkin' ? 'Encaixe registrado' : 'Agendamento criado');
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const title = editing ? `Remarcar · ${editing.client.name}` : mode.kind === 'walkin' ? 'Encaixe (atender agora)' : 'Novo agendamento';
  const needsTime = mode.kind !== 'walkin';
  const valid = (editing || ((name || found) && digits.length >= 10 && serviceId)) && barberId && (!needsTime || (date && time));

  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {!editing && (
          <>
            <Input label="Telefone / WhatsApp" type="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" required />
            {found ? (
              <p className="text-xs text-green-400 font-body">Cliente cadastrado: <strong>{found.name}</strong></p>
            ) : (
              <Input label="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            )}
            <Select label="Serviço" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setBarberId(user.role === 'BARBER' ? user.membershipId : ''); }} required>
              <option value="">Selecione</option>
              {activeServices.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes}min · {formatBRL(s.priceCents)}</option>)}
            </Select>
          </>
        )}

        <Select label="Barbeiro" value={barberId} onChange={(e) => setBarberId(e.target.value)} required disabled={!serviceId}>
          <option value="">Selecione</option>
          {barbers.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
        </Select>

        {needsTime && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="[color-scheme:dark]" />
              <Input label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="[color-scheme:dark]" />
            </div>
            {slots && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#8A8680] mb-2 font-body">Horários livres</p>
                {slots.length === 0 ? (
                  <p className="text-xs text-[#5A5650] font-body">Sem horário livre na grade. Você pode digitar um horário mesmo assim.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {slots.map((s) => (
                      <button
                        type="button"
                        key={s.time}
                        onClick={() => setTime(s.time)}
                        className={`px-2.5 py-1 rounded text-xs font-body tabular-nums ${s.time === time ? 'bg-brand-500 text-dark' : 'bg-white/5 text-[#8A8680] hover:text-white'}`}
                      >
                        {s.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!editing && <TextArea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>
            {editing ? 'Remarcar' : mode.kind === 'walkin' ? 'Registrar encaixe' : 'Agendar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
