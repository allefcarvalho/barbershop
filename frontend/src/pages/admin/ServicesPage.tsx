import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Scissors, Clock, Plus, Pencil } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { formatBRL, parseBRL, centsToInput } from '../../utils/format';
import { useAdminServices, type AdminService } from './admin';
import { AdminLoading, AdminError, EmptyState, TextArea, Pill } from './shared';

export function ServicesPage() {
  const { data: services, isLoading, error, refetch } = useAdminServices();
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null);

  if (isLoading) return <AdminLoading label="serviços" />;
  if (error) return <AdminError message="Erro ao carregar serviços." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#8A8680] font-body">
          {services?.filter((s) => s.active).length} ativo(s) de {services?.length}. Serviços desativados somem do site mas ficam no histórico.
        </p>
        <Button size="sm" onClick={() => setEditing('new')} className="shrink-0">
          <Plus className="w-3.5 h-3.5" /> Novo serviço
        </Button>
      </div>

      {services?.length === 0 ? (
        <EmptyState icon={<Scissors className="w-12 h-12" />}>Nenhum serviço cadastrado.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services?.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditing(s)}
              className={`text-left p-5 rounded-xl bg-panel border border-white/5 hover:border-brand-500/20 transition-all ${s.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h4 className="text-sm font-display font-semibold text-white">{s.name}</h4>
                {s.active ? (
                  <Pencil className="w-3.5 h-3.5 text-[#5A5650] shrink-0" />
                ) : (
                  <Pill className="bg-red-500/10 text-red-400 border-red-500/20">Inativo</Pill>
                )}
              </div>
              <p className="text-xs text-[#8A8680] font-body mb-3 line-clamp-2">{s.description}</p>
              <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                <span className="text-lg font-display font-bold text-brand-400">{formatBRL(s.priceCents)}</span>
                <span className="flex items-center gap-1 text-xs text-[#8A8680] font-body">
                  <Clock className="w-3 h-3" /> {s.durationMinutes} min
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && <ServiceForm service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceForm({ service, onClose }: { service: AdminService | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(service ? centsToInput(service.priceCents) : '');
  const [duration, setDuration] = useState(String(service?.durationMinutes ?? 30));
  const [sortOrder, setSortOrder] = useState(String(service?.sortOrder ?? 0));
  const priceCents = parseBRL(price);

  const done = (msg: string) => {
    toast.success(msg);
    queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
    queryClient.invalidateQueries({ queryKey: ['services'] }); // vitrine do site
    onClose();
  };
  const onError = (e: unknown) => toast.error(apiErrorMessage(e));

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description, priceCents, durationMinutes: Number(duration), sortOrder: Number(sortOrder) };
      return service ? api.put(`/services/${service.id}`, body) : api.post('/services', body);
    },
    onSuccess: () => done(service ? 'Serviço atualizado' : 'Serviço criado'),
    onError,
  });

  const toggle = useMutation({
    mutationFn: () => api.put(`/services/${service!.id}`, { active: !service!.active }),
    onSuccess: () => done(service!.active ? 'Serviço desativado' : 'Serviço reativado'),
    onError,
  });

  return (
    <Modal open onClose={onClose} title={service ? 'Editar serviço' : 'Novo serviço'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
        <TextArea label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={5} maxLength={500} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Preço (R$)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="45,00" required error={price && priceCents === null ? 'Valor inválido' : undefined} />
          <Input label="Duração (min)" type="number" min={5} max={480} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} required />
          <Input label="Ordem" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <p className="text-[11px] text-[#5A5650] font-body">Mudar preço ou duração não altera agendamentos já feitos.</p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {service ? (
            <Button type="button" variant={service.active ? 'danger' : 'secondary'} size="sm" loading={toggle.isPending} onClick={() => toggle.mutate()}>
              {service.active ? 'Desativar' : 'Reativar'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
            <Button type="submit" loading={save.isPending} disabled={priceCents === null}>Salvar</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
