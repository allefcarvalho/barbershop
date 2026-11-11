// Hooks, tipos e constantes compartilhados pelas telas do painel (componentes ficam em shared.tsx).
import { useQuery } from '@tanstack/react-query';
import { api } from '../../config/api';
import { authService, type SessionUser } from '../../services/auth.service';

// ===== Sessão =====

/** Usuário logado (o cache é preenchido pelo AdminLayout, que já garantiu a sessão). */
export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: authService.restore, staleTime: Infinity, retry: false }).data as SessionUser;
}

export const isManager = (u?: SessionUser) => u?.role === 'OWNER' || u?.role === 'MANAGER';
export const isFrontDesk = (u?: SessionUser) => isManager(u) || u?.role === 'RECEPTIONIST';

// ===== Dados usados em várias telas =====

export interface StaffMember {
  id: string;
  role: SessionUser['role'];
  active: boolean;
  user: { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null };
  services: { service: { id: string; name: string } }[];
}

export interface AdminService {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  sortOrder: number;
}

export const useStaff = () =>
  useQuery<StaffMember[]>({ queryKey: ['admin', 'staff'], queryFn: async () => (await api.get('/barbers')).data.data, staleTime: 60_000 });

export const useAdminServices = () =>
  useQuery<AdminService[]>({ queryKey: ['admin', 'services'], queryFn: async () => (await api.get('/services')).data.data, staleTime: 60_000 });

// ===== Datas =====

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const weekdayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' });

// ===== Estilos e rótulos =====

export const fieldClass =
  'w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-body placeholder:text-[#5A5650] hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 disabled:opacity-50';

export const BOOKING_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
  COMPLETED: { label: 'Concluído', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  NO_SHOW: { label: 'Não veio', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
};
