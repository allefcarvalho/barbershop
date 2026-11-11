import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input } from '../../components/ui';
import { useSession, isManager } from './admin';
import { AdminLoading, AdminError, Select } from './shared';

interface Settings {
  slug: string;
  name: string;
  timezone: string;
  slotStepMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  clientCancelMinHours: number;
  recurringThreshold: number;
  maxActiveBookingsPerPhone: number;
  requireConfirmation: boolean;
}

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Rio_Branco', 'America/Noronha'];

export function SettingsPage() {
  const { data, isLoading, error, refetch } = useQuery<Settings>({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get('/settings')).data.data,
  });
  if (isLoading) return <AdminLoading label="configurações" />;
  if (error || !data) return <AdminError message="Erro ao carregar configurações." onRetry={() => refetch()} />;
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const user = useSession();
  const canEdit = isManager(user);
  const queryClient = useQueryClient();
  const [s, setS] = useState(initial);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const num = (k: keyof Settings) => ({
    type: 'number' as const,
    value: String(s[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never),
    disabled: !canEdit,
    required: true,
  });

  const save = useMutation({
    // O slug (endereço do site) não é editável aqui; a API ignora campos fora do schema.
    mutationFn: () => api.put('/settings', { ...s, slug: undefined }),
    onSuccess: () => {
      toast.success('Configurações salvas');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <form className="max-w-2xl space-y-8 animate-fade" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Section title="Barbearia">
        <Input label="Nome" value={s.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit} required minLength={2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Fuso horário" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} disabled={!canEdit}>
            {[...new Set([s.timezone, ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')}</option>)}
          </Select>
          <Input label="Endereço do site" value={`/${s.slug}`} disabled />
        </div>
      </Section>

      <Section title="Agendamento online" hint="Valem para o site. A equipe pode agendar fora dessas regras pelo painel.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Horários a cada" value={String(s.slotStepMinutes)} onChange={(e) => set('slotStepMinutes', Number(e.target.value))} disabled={!canEdit}>
            {[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n} minutos</option>)}
          </Select>
          <Input label="Antecedência mínima (min)" min={0} {...num('minAdvanceMinutes')} />
          <Input label="Agendar com até (dias)" min={1} max={365} {...num('maxAdvanceDays')} />
          <Input label="Agendamentos abertos por telefone" min={1} max={20} {...num('maxActiveBookingsPerPhone')} />
        </div>
        <label className="flex items-start gap-3 text-sm text-[#C8C4BC] font-body cursor-pointer">
          <input type="checkbox" checked={s.requireConfirmation} onChange={(e) => set('requireConfirmation', e.target.checked)} disabled={!canEdit} className="mt-0.5 w-4 h-4 accent-[#C9A96E]" />
          <span>Confirmar manualmente cada agendamento online <span className="block text-xs text-[#5A5650]">O horário fica reservado como "pendente" até alguém da equipe confirmar.</span></span>
        </label>
      </Section>

      <Section title="Cancelamento e fidelidade">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Cliente cancela pelo link até (horas antes)" min={0} max={168} {...num('clientCancelMinHours')} />
          <Input label="Vira cliente recorrente a partir de (visitas)" min={1} max={100} {...num('recurringThreshold')} />
        </div>
      </Section>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>Salvar configurações</Button>
        </div>
      ) : (
        <p className="text-xs text-[#5A5650] font-body">Somente o dono ou gerente altera as configurações.</p>
      )}
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 p-5 rounded-xl bg-panel border border-white/5">
      <div>
        <h3 className="text-sm font-display font-semibold text-white uppercase tracking-wider">{title}</h3>
        {hint && <p className="text-xs text-[#8A8680] font-body mt-1">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
