import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Package, Plus, Pencil, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react';
import { api, apiErrorMessage } from '../../config/api';
import { Button, Input, Modal } from '../../components/ui';
import { formatBRL, parseBRL, centsToInput } from '../../utils/format';
import { useSession, isManager } from './admin';
import { AdminLoading, AdminError, EmptyState, TextArea, Select, Pill } from './shared';

interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  stockQuantity: number;
  stockMin: number;
  active: boolean;
}

interface Movement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reason: string | null;
  createdAt: string;
  membership: { user: { name: string } };
}

const MOVE_LABEL = { IN: 'Entrada', OUT: 'Saída', ADJUSTMENT: 'Ajuste (contagem)' };

export function ProductsPage() {
  const user = useSession();
  const { data: products, isLoading, error, refetch } = useQuery<Product[]>({
    queryKey: ['admin', 'products'],
    queryFn: async () => (await api.get('/products')).data.data,
  });
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [stockOf, setStockOf] = useState<Product | null>(null);

  if (isLoading) return <AdminLoading label="produtos" />;
  if (error) return <AdminError message="Erro ao carregar produtos." onRetry={() => refetch()} />;

  const low = products?.filter((p) => p.active && p.stockQuantity <= p.stockMin).length ?? 0;

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#8A8680] font-body">
          {products?.length} produto(s){low > 0 && <span className="text-yellow-400"> · {low} com estoque baixo</span>}
        </p>
        {isManager(user) && (
          <Button size="sm" onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="w-3.5 h-3.5" /> Novo produto
          </Button>
        )}
      </div>

      {products?.length === 0 ? (
        <EmptyState icon={<Package className="w-12 h-12" />}>Nenhum produto cadastrado.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products?.map((p) => {
            const lowStock = p.stockQuantity <= p.stockMin;
            return (
              <div key={p.id} className={`p-5 rounded-xl bg-panel border border-white/5 ${p.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-display font-semibold text-white">{p.name}</h4>
                  <div className="flex items-center gap-2 shrink-0">
                    {!p.active && <Pill className="bg-red-500/10 text-red-400 border-red-500/20">Inativo</Pill>}
                    {p.active && lowStock && <Pill className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Estoque baixo</Pill>}
                    {isManager(user) && (
                      <button onClick={() => setEditing(p)} className="p-1 text-[#5A5650] hover:text-white" aria-label={`Editar ${p.name}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#8A8680] font-body mb-3 line-clamp-2">{p.description}</p>
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <span className="text-lg font-display font-bold text-brand-400">{formatBRL(p.priceCents)}</span>
                  <button
                    onClick={() => setStockOf(p)}
                    className={`flex items-center gap-1.5 text-xs font-body font-medium px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 ${lowStock ? 'text-yellow-400' : 'text-[#C8C4BC]'}`}
                  >
                    <SlidersHorizontal className="w-3 h-3" /> {p.stockQuantity} un. (mín. {p.stockMin})
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {stockOf && <StockModal product={stockOf} onClose={() => setStockOf(null)} />}
    </div>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? centsToInput(product.priceCents) : '');
  const [stockMin, setStockMin] = useState(String(product?.stockMin ?? 5));
  const priceCents = parseBRL(price);

  const done = (msg: string) => {
    toast.success(msg);
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    queryClient.invalidateQueries({ queryKey: ['products-public'] });
    onClose();
  };
  const onError = (e: unknown) => toast.error(apiErrorMessage(e));

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description, priceCents, stockMin: Number(stockMin) };
      return product ? api.put(`/products/${product.id}`, body) : api.post('/products', body);
    },
    onSuccess: () => done(product ? 'Produto atualizado' : 'Produto criado. Registre a entrada de estoque.'),
    onError,
  });
  const toggle = useMutation({
    mutationFn: () => api.put(`/products/${product!.id}`, { active: !product!.active }),
    onSuccess: () => done(product!.active ? 'Produto desativado' : 'Produto reativado'),
    onError,
  });

  return (
    <Modal open onClose={onClose} title={product ? 'Editar produto' : 'Novo produto'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
        <TextArea label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={5} maxLength={500} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Preço (R$)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="45,00" required error={price && priceCents === null ? 'Valor inválido' : undefined} />
          <Input label="Estoque mínimo" type="number" min={0} value={stockMin} onChange={(e) => setStockMin(e.target.value)} required />
        </div>
        <p className="text-[11px] text-[#5A5650] font-body">A quantidade em estoque só muda por movimentação (entrada, saída ou ajuste).</p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {product ? (
            <Button type="button" variant={product.active ? 'danger' : 'secondary'} size="sm" loading={toggle.isPending} onClick={() => toggle.mutate()}>
              {product.active ? 'Desativar' : 'Reativar'}
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

function StockModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<Movement['type']>('IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const { data: history } = useQuery<Movement[]>({
    queryKey: ['admin', 'stock', product.id],
    queryFn: async () => (await api.get(`/products/${product.id}/stock`)).data.data,
  });

  const move = useMutation({
    mutationFn: () => api.post(`/products/${product.id}/stock`, { type, quantity: Number(quantity), reason: reason || undefined }),
    onSuccess: () => {
      toast.success('Movimentação registrada');
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stock', product.id] });
      onClose();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Estoque · ${product.name}`}>
      <div className="space-y-5">
        <p className="text-sm text-[#C8C4BC] font-body">Saldo atual: <strong className="text-white">{product.stockQuantity} un.</strong></p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); move.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as Movement['type'])}>
              {Object.entries(MOVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input
              label={type === 'ADJUSTMENT' ? 'Quantidade contada' : 'Quantidade'}
              type="number"
              min={type === 'ADJUSTMENT' ? 0 : 1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <Input label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: compra do fornecedor, venda no balcão" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
            <Button type="submit" loading={move.isPending} disabled={quantity === ''}>Registrar</Button>
          </div>
        </form>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#8A8680] mb-2 font-body">Últimas movimentações</p>
          {history?.length === 0 && <p className="text-xs text-[#5A5650] font-body">Nenhuma movimentação ainda.</p>}
          <ul className="max-h-48 overflow-y-auto divide-y divide-white/5">
            {history?.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-xs font-body">
                {m.type === 'IN' ? <ArrowDownToLine className="w-3.5 h-3.5 text-green-400" /> : m.type === 'OUT' ? <ArrowUpFromLine className="w-3.5 h-3.5 text-red-400" /> : <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />}
                <span className="text-white w-16 shrink-0">{m.type === 'ADJUSTMENT' ? `= ${m.quantity}` : `${m.type === 'IN' ? '+' : '−'}${m.quantity}`}</span>
                <span className="text-[#8A8680] flex-1 truncate">{m.reason ?? MOVE_LABEL[m.type]}</span>
                <span className="text-[#5A5650] shrink-0">{new Date(m.createdAt).toLocaleDateString('pt-BR')} · {m.membership.user.name.split(' ')[0]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
