import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trash2, CalendarOff } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input } from '../../components/ui';
import { useSession, useStaff, isManager } from './admin';
import { AdminLoading, Select } from './shared';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface DayRow { dayOfWeek: number; startTime: string; endTime: string; active: boolean }
interface Exception { id: string; date: string; isBlocked: boolean; startTime: string | null; endTime: string | null; reason: string | null }

/** Grade semanal e exceções (folga, bloqueio parcial, horário especial). Barbeiro vê só a própria. */
export function SchedulePage() {
  const me = useSession();
  const manager = isManager(me);
  const { data: staff } = useStaff();
  const people = (staff ?? []).filter((m) => m.active && m.services.length > 0);
  const [picked, setPicked] = useState<string | null>(null);
  // Padrão: a própria agenda, se a pessoa atende; senão (ex.: dono que não corta), o primeiro barbeiro.
  const memberId = picked ?? (people.some((p) => p.id === me.membershipId) ? me.membershipId : people[0]?.id ?? me.membershipId);
  const setMemberId = setPicked;

  return (
    <div className="space-y-8 animate-fade">
      {manager && (
        <Select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Profissional" className="sm:w-72">
          {!people.some((p) => p.id === me.membershipId) && <option value={me.membershipId}>{me.name} (você)</option>}
          {people.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}
        </Select>
      )}
      {/* key: troca de profissional remonta os formulários com os dados certos */}
      <WeeklyGrid key={`g-${memberId}`} memberId={memberId} />
      <Exceptions key={`e-${memberId}`} memberId={memberId} />
    </div>
  );
}

function WeeklyGrid({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<DayRow[]>({
    queryKey: ['admin', 'availability', memberId],
    queryFn: async () => (await api.get(`/availability/${memberId}`)).data.data,
  });
  const [rows, setRows] = useState<DayRow[] | null>(null);

  if (isLoading || !data) return <AdminLoading label="horários" />;
  const grid = rows ?? DAYS.map((_, d) => data.find((r) => r.dayOfWeek === d) ?? { dayOfWeek: d, startTime: '09:00', endTime: '18:00', active: false });
  const update = (d: number, patch: Partial<DayRow>) => setRows(grid.map((r) => (r.dayOfWeek === d ? { ...r, ...patch } : r)));

  const invalid = grid.some((r) => r.active && r.startTime >= r.endTime);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">Horário semanal</h3>
      <div className="rounded-xl bg-panel border border-white/5 divide-y divide-white/5">
        {grid.map((r) => (
          <div key={r.dayOfWeek} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <label className="flex items-center gap-2 w-32 text-sm text-white font-body cursor-pointer">
              <input type="checkbox" checked={r.active} onChange={(e) => update(r.dayOfWeek, { active: e.target.checked })} className="w-4 h-4 accent-[#C9A96E]" />
              {DAYS[r.dayOfWeek]}
            </label>
            {r.active ? (
              <div className="flex items-center gap-2">
                <input type="time" value={r.startTime} onChange={(e) => update(r.dayOfWeek, { startTime: e.target.value })} aria-label={`${DAYS[r.dayOfWeek]} início`}
                  className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white font-body [color-scheme:dark]" />
                <span className="text-[#5A5650] text-xs">até</span>
                <input type="time" value={r.endTime} onChange={(e) => update(r.dayOfWeek, { endTime: e.target.value })} aria-label={`${DAYS[r.dayOfWeek]} fim`}
                  className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white font-body [color-scheme:dark]" />
                {r.startTime >= r.endTime && <span className="text-xs text-red-400 font-body">início deve ser antes do fim</span>}
              </div>
            ) : (
              <span className="text-xs text-[#5A5650] font-body">Folga</span>
            )}
          </div>
        ))}
      </div>
      <SaveGrid memberId={memberId} grid={grid} disabled={!rows || invalid} onSaved={() => {
        setRows(null);
        queryClient.invalidateQueries({ queryKey: ['admin', 'availability', memberId] });
      }} />
    </section>
  );
}

function SaveGrid({ memberId, grid, disabled, onSaved }: { memberId: string; grid: DayRow[]; disabled: boolean; onSaved: () => void }) {
  const save = useMutation({
    mutationFn: () => api.put(`/availability/${memberId}`, { schedules: grid }),
    onSuccess: () => {
      toast.success('Horário salvo');
      onSaved();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <div className="flex justify-end">
      <Button size="sm" loading={save.isPending} disabled={disabled} onClick={() => save.mutate()}>Salvar horário</Button>
    </div>
  );
}

type ExceptionKind = 'off' | 'block' | 'special';

function Exceptions({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery<Exception[]>({
    queryKey: ['admin', 'exceptions', memberId],
    queryFn: async () => (await api.get(`/availability/${memberId}/exceptions`)).data.data,
  });
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<ExceptionKind>('off');
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('13:00');
  const [reason, setReason] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'exceptions', memberId] });

  const add = useMutation({
    mutationFn: () =>
      api.post(`/availability/${memberId}/exceptions`, {
        date,
        isBlocked: kind !== 'special',
        ...(kind === 'off' ? {} : { startTime: start, endTime: end }),
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success('Exceção salva');
      setDate('');
      setReason('');
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/availability/${memberId}/exceptions/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const describe = (x: Exception) =>
    !x.isBlocked ? `Horário especial ${x.startTime}–${x.endTime}` : x.startTime ? `Bloqueado ${x.startTime}–${x.endTime}` : 'Folga o dia todo';

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">Folgas e exceções</h3>
      <p className="text-xs text-[#8A8680] font-body">Uma data aqui vale mais que o horário semanal. Agendamentos já marcados não são cancelados automaticamente.</p>

      <form className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end p-4 rounded-xl bg-panel border border-white/5" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <div className="col-span-2 sm:col-span-2">
          <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="[color-scheme:dark]" />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as ExceptionKind)}>
            <option value="off">Folga (dia todo)</option>
            <option value="block">Bloquear um período</option>
            <option value="special">Horário especial</option>
          </Select>
        </div>
        {kind !== 'off' && (
          <>
            <Input label="De" type="time" value={start} onChange={(e) => setStart(e.target.value)} required className="[color-scheme:dark]" />
            <Input label="Até" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required className="[color-scheme:dark]" />
          </>
        )}
        <div className="col-span-2 sm:col-span-4">
          <Input label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: feriado, consulta médica" />
        </div>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" size="sm" loading={add.isPending} disabled={!date || (kind !== 'off' && start >= end)}>Adicionar</Button>
        </div>
      </form>

      {data?.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-[#5A5650] font-body"><CalendarOff className="w-4 h-4" /> Nenhuma exceção futura.</p>
      ) : (
        <ul className="rounded-xl bg-panel border border-white/5 divide-y divide-white/5">
          {data?.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-3 text-sm font-body">
              <span className="text-white tabular-nums w-24 shrink-0">{x.date.slice(0, 10).split('-').reverse().join('/')}</span>
              <span className="text-[#C8C4BC] flex-1 min-w-0 truncate">{describe(x)}{x.reason && <span className="text-[#5A5650]"> · {x.reason}</span>}</span>
              <button onClick={() => remove.mutate(x.id)} className="p-1.5 text-[#5A5650] hover:text-red-400" aria-label="Remover exceção">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
