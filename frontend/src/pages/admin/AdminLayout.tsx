// =============================================
// Barbearia Vikings — Admin Layout Shell
// =============================================

import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService, type SessionUser } from '../../services/auth.service';
import { LayoutDashboard, Calendar, Scissors, Package, LogOut, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import logo from '../../assets/logo.png';

const sidebarLinks = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Agenda', href: '/admin/agenda', icon: Calendar },
  { label: 'Serviços', href: '/admin/servicos', icon: Scissors },
  { label: 'Produtos', href: '/admin/produtos', icon: Package },
];

const ROLE_LABEL: Record<SessionUser['role'], string> = {
  OWNER: 'Dono',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepção',
  BARBER: 'Barbeiro',
};

/** Guarda das rotas /admin: sem sessão válida (nem cookie para renovar) → /login. */
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: authService.restore,
    retry: false,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark">
        <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const logout = async () => {
    await authService.logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex min-h-screen bg-dark">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-panel border-r border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <img src={logo} alt="Vikings" className="w-9 h-9 object-contain" />
          <div>
            <span className="text-sm font-display font-bold text-white tracking-wider">VIKINGS</span>
            <span className="block text-[9px] uppercase tracking-[0.2em] text-brand-400 font-body">Admin</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            const active = location.pathname === link.href;
            return (
              <Link
                key={link.href}
                to={link.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 font-body',
                  active
                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/15'
                    : 'text-[#5A5650] hover:text-[#8A8680] hover:bg-white/5',
                )}
              >
                <Icon className="w-4 h-4" />
                {link.label}
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-white/5 p-3">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#5A5650] hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/5 font-body"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 lg:px-8 py-4 border-b border-white/5 bg-panel/50 backdrop-blur-sm">
          <h2 className="text-lg font-display font-semibold text-white">
            {sidebarLinks.find((l) => l.href === location.pathname)?.label || 'Admin'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm text-white font-body">{user.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-[#5A5650] font-body">
                {ROLE_LABEL[user.role]} · {user.tenant.name}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-brand-400 font-body">{initials}</span>
            </div>
            <button onClick={logout} className="lg:hidden text-[#5A5650] hover:text-red-400" aria-label="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-6 lg:p-8 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
