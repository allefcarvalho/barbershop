import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Users, Plus, Mail, Phone } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { useSession, useStaff, useAdminServices, type StaffMember } from './admin';
import { AdminLoading, AdminError, EmptyState, Select, Pill } from './shared';

const ROLES = { OWNER: 'Dono', MANAGER: 'Gerente', RECEPTIONIST: 'Recepção', BARBER: 'Barbeiro' } as const;
type Role = keyof typeof ROLES;

export function TeamPage() {
  const { data: staff, isLoading, error, refetch } = useStaff();
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);

  if (isLoading) return <AdminLoading label="equipe" />;
  if (error) return <AdminError message="Erro ao carregar a equipe." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#8A8680] font-body">Quem atende precisa ter serviços marcados para aparecer no site.</p>
        <Button size="sm" onClick={() => setEditing('new')} className="shrink-0">
          <Plus className="w-3.5 h-3.5" /> Novo membro
        </Button>
      </div>

      {staff?.length === 0 ? (
        <EmptyState icon={<Users className="w-12 h-12" />}>Nenhum membro na equipe.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {staff?.map((m) => (
            <button
              key={m.id}
              onClick={() => setEditing(m)}
              className={`text-left p-5 rounded-xl bg-panel border border-white/5 hover:border-brand-500/20 transition-all ${m.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-display font-semibold text-white">{m.user.name}</h4>
                <Pill className={m.active ? 'bg-brand-500/10 text-brand-400 border-brand-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
                  {m.active ? ROLES[m.role] : 'Inativo'}
                </Pill>
              </div>
              <p className="flex items-center gap-1.5 mt-2 text-xs text-[#8A8680] font-body truncate"><Mail className="w-3 h-3 shrink-0" /> {m.user.email}</p>
              {m.user.phone && <p className="flex items-center gap-1.5 text-xs text-[#8A8680] font-body"><Phone className="w-3 h-3" /> {m.user.phone}</p>}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {m.services.length === 0 ? (
                  <span className="text-[11px] text-[#5A5650] font-body">Não atende clientes</span>
                ) : (
                  m.services.map((s) => (
                    <span key={s.service.id} className="px-2 py-0.5 text-[10px] text-[#8A8680] bg-white/5 rounded-full font-body">{s.service.name}</span>
                  ))
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && <MemberForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberForm({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const me = useSession();
  const queryClient = useQueryClient();
  const { data: services } = useAdminServices();
  const [name, setName] = useState(member?.user.name ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(member?.user.phone ?? '');
  const [role, setRole] = useState<Role>(member?.role ?? 'BARBER');
  const [serviceIds, setServiceIds] = useState<string[]>(member?.services.map((s) => s.service.id) ?? []);
  const isSelf = member?.id === me.membershipId;

  const done = (msg: string) => {
    toast.success(msg);
    queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
    queryClient.invalidateQueries({ queryKey: ['barbers'] }); // lista do site
    onClose();
  };
  const onError = (e: unknown) => toast.error(apiErrorMessage(e));

  const save = useMutation({
    mutationFn: () =>
      member
        ? api.put(`/barbers/${member.id}`, { name, phone: phone || undefined, ...(isSelf ? {} : { role }), serviceIds })
        : api.post('/barbers', { name, email, password, phone: phone || undefined, role, serviceIds }),
    onSuccess: () => done(member ? 'Membro atualizado' : 'Membro cadastrado'),
    onError,
  });

  const toggle = useMutation({
    mutationFn: () => api.put(`/barbers/${member!.id}`, { active: !member!.active }),
    onSuccess: () => done(member!.active ? 'Membro desativado' : 'Membro reativado'),
    onError,
  });

  const flip = (id: string) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Modal open onClose={onClose} title={member ? `Editar · ${member.user.name}` : 'Novo membro da equipe'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
        {!member && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="E-mail (login)" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Senha inicial" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Telefone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select label="Papel" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
            {(Object.keys(ROLES) as Role[])
              .filter((r) => r !== 'OWNER' || me.role === 'OWNER')
              .map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
          </Select>
        </div>

        <fieldset>
          <legend className="text-xs font-medium tracking-wider uppercase text-[#8A8680] font-body mb-2">Serviços que atende</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {services?.filter((s) => s.active).map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-[#C8C4BC] font-body cursor-pointer">
                <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => flip(s.id)} className="w-4 h-4 accent-[#C9A96E]" />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>

        {!member && <p className="text-[11px] text-[#5A5650] font-body">Passe a senha inicial pessoalmente. Depois de cadastrar, ajuste os horários em "Horários".</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {member && !isSelf ? (
            <Button type="button" variant={member.active ? 'danger' : 'secondary'} size="sm" loading={toggle.isPending}
              onClick={() => (!member.active || window.confirm('Desativar cancela os agendamentos futuros deste membro. Continuar?')) && toggle.mutate()}>
              {member.active ? 'Desativar' : 'Reativar'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
            <Button type="submit" loading={save.isPending}>Salvar</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
