import { api, refreshSession, setAccessToken } from '../config/api';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  membershipId: string;
  role: 'OWNER' | 'MANAGER' | 'RECEPTIONIST' | 'BARBER';
  tenant: { slug: string; name: string };
}

export const authService = {
  async login(email: string, password: string, tenantSlug?: string): Promise<SessionUser> {
    const res = await api.post('/auth/login', { email, password, tenantSlug });
    setAccessToken(res.data.data.accessToken);
    return res.data.data.user;
  },

  /** Restaura a sessão a partir do cookie httpOnly (ex.: ao recarregar a página). */
  async restore(): Promise<SessionUser> {
    const data = (await refreshSession()) as unknown as { user: SessionUser };
    return data.user;
  },

  async logout() {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
  },
};
