// =============================================
// Barbearia Vikings — Admin Pages (API Integrated)
// =============================================

import { useState } from 'react';
import { Calendar, Scissors, Package, Clock, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../../config/api';
import { formatBRL } from '../../utils/format';

// ===== Shared loading / error components =====

function AdminLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 animate-fade">
      <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin mb-4" />
      <p className="text-sm text-[#5A5650] font-body">Carregando {label}...</p>
    </div>
  );
}

function AdminError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 animate-fade">
      <AlertCircle className="w-10 h-10 text-red-400/50 mb-4" />
      <p className="text-sm text-[#8A8680] font-body mb-3">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-xs uppercase tracking-wider font-semibold bg-brand-500/10 text-brand-400 rounded-lg border border-brand-500/20 hover:bg-brand-500/20 transition-all font-body"
      >
        Tentar Novamente
      </button>
    </div>
  );
}

// ===== Agenda Page =====

interface BookingData {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  client: { name: string; phone: string };
  barber: { user: { name: string } };
  service: { name: string };
}

export function AgendaPage() {
  const [dateFilter] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const { data: bookings, isLoading, error, refetch } = useQuery<{ data: BookingData[]; total: number }>({
    queryKey: ['admin-bookings', dateFilter],
    queryFn: async () => {
      const res = await api.get('/bookings', { params: { date: dateFilter, page: 1, pageSize: 50 } });
      return res.data;
    },
    retry: 1,
  });

  if (isLoading) return <AdminLoading label="agendamentos" />;
  if (error) return <AdminError message="Erro ao carregar agendamentos. Verifique se está autenticado." onRetry={() => refetch()} />;

  const items = bookings?.data || [];

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-white tracking-wider uppercase">
          Agendamentos
        </h3>
        <span className="text-xs text-[#5A5650] font-body">{items.length} registros</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-brand-500/20 mx-auto mb-4" />
          <p className="text-sm text-[#5A5650] font-body">Nenhum agendamento encontrado para esta data.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-panel border border-white/5 overflow-hidden divide-y divide-white/5">
          {items.map((booking) => {
            const time = new Date(booking.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const statusMap: Record<string, { label: string; className: string }> = {
              CONFIRMED: { label: 'Confirmado', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
              PENDING: { label: 'Pendente', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
              COMPLETED: { label: 'Concluído', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
              CANCELLED: { label: 'Cancelado', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
              NO_SHOW: { label: 'Não compareceu', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
            };
            const status = statusMap[booking.status] || statusMap.PENDING;

            return (
              <div key={booking.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <span className="text-sm font-mono text-brand-400 w-14 shrink-0 font-body">{time}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white font-body truncate">{booking.client.name}</p>
                  <p className="text-xs text-[#5A5650] font-body">{booking.service.name} • {booking.barber.user.name}</p>
                </div>
                <span className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-full font-body border ${status.className}`}>
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== Services Page =====

interface ServiceData {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  sortOrder: number;
}

export function ServicesPage() {
  const { data: services, isLoading, error, refetch } = useQuery<ServiceData[]>({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const res = await api.get('/services');
      return res.data.data;
    },
  });

  if (isLoading) return <AdminLoading label="serviços" />;
  if (error) return <AdminError message="Erro ao carregar serviços." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-white tracking-wider uppercase">
          Serviços Cadastrados
        </h3>
        <span className="text-xs text-[#5A5650] font-body">{services?.length || 0} serviços</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {services?.map((service) => (
          <div key={service.id} className="p-5 rounded-xl bg-panel border border-white/5 hover:border-brand-500/10 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
                <Scissors className="w-4 h-4 text-brand-400" />
              </div>
              <span className={`px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full font-body border ${
                service.active
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                {service.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <h4 className="text-sm font-display font-semibold text-white mb-1">{service.name}</h4>
            <p className="text-xs text-[#5A5650] font-body mb-3 line-clamp-2">{service.description}</p>
            <div className="flex items-center gap-3 pt-3 border-t border-white/5">
              <span className="text-lg font-display font-bold text-brand-400">{formatBRL(service.priceCents)}</span>
              <span className="flex items-center gap-1 text-xs text-[#5A5650] font-body">
                <Clock className="w-3 h-3" />
                {service.durationMinutes}min
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Products Page =====

interface ProductData {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  stockQuantity: number;
  stockMin: number;
  active: boolean;
  imageUrl: string | null;
}

export function ProductsPage() {
  const { data: products, isLoading, error, refetch } = useQuery<ProductData[]>({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data.data;
    },
  });

  if (isLoading) return <AdminLoading label="produtos" />;
  if (error) return <AdminError message="Erro ao carregar produtos." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-fade">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-white tracking-wider uppercase">
          Produtos Cadastrados
        </h3>
        <span className="text-xs text-[#5A5650] font-body">{products?.length || 0} produtos</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {products?.map((product) => {
          const lowStock = product.stockQuantity <= product.stockMin;
          return (
            <div key={product.id} className="p-5 rounded-xl bg-panel border border-white/5 hover:border-brand-500/10 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
                  <Package className="w-4 h-4 text-brand-400" />
                </div>
                {lowStock && (
                  <span className="px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full font-body border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                    Estoque Baixo
                  </span>
                )}
              </div>
              <h4 className="text-sm font-display font-semibold text-white mb-1">{product.name}</h4>
              <p className="text-xs text-[#5A5650] font-body mb-3 line-clamp-2">{product.description}</p>
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="text-lg font-display font-bold text-brand-400">{formatBRL(product.priceCents)}</span>
                <span className={`text-xs font-body font-medium ${lowStock ? 'text-yellow-400' : 'text-[#5A5650]'}`}>
                  {product.stockQuantity} un.
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
