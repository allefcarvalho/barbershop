// =============================================
// Barbearia Vikings — Login Page
// =============================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { authService } from '../services/auth.service';
import { apiErrorMessage } from '../config/api';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Container } from '../components/layout/Container';
import logo from '../assets/logo.png';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [tenants, setTenants] = useState<{ slug: string; name: string }[]>([]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const doLogin = async (tenantSlug?: string) => {
    setError('');
    setLoading(true);
    try {
      const user = await authService.login(email, password, tenantSlug);
      queryClient.setQueryData(['session'], user);
      navigate('/admin', { replace: true });
    } catch (err) {
      const data = (err as AxiosError<{ code?: string; data?: { tenants: { slug: string; name: string }[] } }>).response?.data;
      if (data?.code === 'CHOOSE_TENANT' && data.data) setTenants(data.data.tenants);
      else setError(apiErrorMessage(err, 'Não foi possível entrar. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin();
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F] via-[#0A0A0F] to-[#12121A]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(201,169,110,0.04)_0%,_transparent_60%)]" />

      <Container size="sm" className="relative z-10">
        <div className="max-w-sm mx-auto">
          {/* Logo */}
          <Link to="/" className="flex flex-col items-center mb-10 group">
            <img
              src={logo}
              alt="Barbearia Vikings"
              className="w-20 h-20 object-contain mb-4 transition-transform duration-300 group-hover:scale-110"
            />
            <span className="text-xl font-display font-bold text-white tracking-wider">VIKINGS</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-brand-400 font-body mt-1">
              Área Administrativa
            </span>
          </Link>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-wider text-[#8A8680] mb-2 font-body">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@vikinges.com"
                className="w-full px-4 py-3 bg-panel border border-white/10 rounded-lg text-white placeholder-[#5A5650]/50 focus:border-brand-500/40 focus:outline-none transition-colors font-body"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs uppercase tracking-wider text-[#8A8680] mb-2 font-body">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 bg-panel border border-white/10 rounded-lg text-white placeholder-[#5A5650]/50 focus:border-brand-500/40 focus:outline-none transition-colors font-body"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-[#8A8680] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {tenants.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-[#5A5650] font-body">Escolha a barbearia</p>
                {tenants.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => doLogin(t.slug)}
                    className="w-full px-4 py-3 text-left text-sm text-white bg-panel border border-white/10 rounded-lg hover:border-brand-500/40 transition-colors font-body"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-2.5 font-body">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-brand-500 hover:bg-brand-600 text-dark font-semibold text-sm tracking-wider uppercase rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-body"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {/* Back link */}
          <p className="text-center mt-8 text-xs text-[#5A5650] font-body">
            <Link to="/" className="hover:text-brand-400 transition-colors">
              ← Voltar ao site
            </Link>
          </p>
        </div>
      </Container>
    </main>
  );
}
