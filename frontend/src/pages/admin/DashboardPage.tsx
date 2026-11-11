// =============================================
// Barbearia Vikings — Admin Dashboard Page (API)
// =============================================

import { Calendar, Users, Scissors, Package, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../config/api';

// ===== Types =====

interface ServiceData {
  id: string;
  name: string;
  active: boolean;
}

interface ProductData {
  id: string;
  name: string;
}

interface MemberData {
  id: string;
  active: boolean;
  user: { name: string };
}

// ===== Dashboard Page =====

export function DashboardPage() {
  // Fetch services (public)
  const { data: services } = useQuery<ServiceData[]>({
    queryKey: ['dashboard-services'],
    queryFn: async () => {
      const res = await api.get('/services');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch barbers (public)
  const { data: barbers } = useQuery<MemberData[]>({
    queryKey: ['dashboard-barbers'],
    queryFn: async () => {
      const res = await api.get('/barbers');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch products (public fallback)
  const { data: products } = useQuery<ProductData[]>({
    queryKey: ['dashboard-products'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = [
    {
      label: 'Serviços Ativos',
      value: services?.filter((s) => s.active).length?.toString() || '—',
      icon: Scissors,
      trend: services ? `${services.length} total` : '',
    },
    {
      label: 'Barbeiros',
      value: barbers?.filter((b) => b.active).length?.toString() || '—',
      icon: Users,
      trend: barbers ? `${barbers.length} total` : '',
    },
    {
      label: 'Produtos',
      value: products?.length?.toString() || '—',
      icon: Package,
      trend: '',
    },
    {
      label: 'Hoje',
      value: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      icon: Calendar,
      trend: new Date().toLocaleDateString('pt-BR', { weekday: 'long' }),
    },
  ];

  return (
    <div className="space-y-8 animate-fade">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="p-5 rounded-xl bg-panel border border-white/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-brand-400" />
                </div>
                <span className="text-xs uppercase tracking-wider text-[#5A5650] font-body">{stat.label}</span>
              </div>
              <p className="text-3xl font-display font-bold text-white">{stat.value}</p>
              {stat.trend && (
                <p className="flex items-center gap-1 mt-2 text-xs text-[#5A5650] font-body">
                  <TrendingUp className="w-3 h-3 text-brand-400" />
                  {stat.trend}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Services overview */}
      {services && services.length > 0 && (
        <div className="rounded-xl bg-panel border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <h3 className="text-sm font-display font-semibold text-white tracking-wider uppercase">
              Serviços Cadastrados
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-[#5A5650] font-body">
              <Scissors className="w-3.5 h-3.5" />
              {services.length} serviços
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {services.map((service) => (
              <div key={service.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                  <Scissors className="w-3.5 h-3.5 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white font-body truncate">{service.name}</p>
                </div>
                <span
                  className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-full font-body border ${
                    service.active
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}
                >
                  {service.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barbers overview */}
      {barbers && barbers.length > 0 && (
        <div className="rounded-xl bg-panel border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <h3 className="text-sm font-display font-semibold text-white tracking-wider uppercase">
              Equipe
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-[#5A5650] font-body">
              <Users className="w-3.5 h-3.5" />
              {barbers.length} barbeiros
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {barbers.map((barber) => (
              <div key={barber.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white font-body truncate">{barber.user.name}</p>
                </div>
                <span
                  className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-full font-body border ${
                    barber.active
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}
                >
                  {barber.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
