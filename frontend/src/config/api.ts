import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

/** Barbearia exibida no site público. Na plataforma multi-barbearia virá da URL (/:slug). */
export const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG ?? 'vikings';
export const pub = (path: string) => `/public/${TENANT_SLUG}${path}`;

const api = axios.create({ baseURL: '/api/v1', timeout: 10000, withCredentials: true });

// Access token só em memória (não em localStorage → um XSS não consegue levar a sessão para outro lugar).
// O refresh token fica num cookie httpOnly que o JS não lê.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

// Uma única renovação em andamento, compartilhada por todas as requisições que receberem 401 juntas.
let refreshing: Promise<{ accessToken: string; user: unknown }> | null = null;
export function refreshSession() {
  refreshing ??= axios
    .post('/api/v1/auth/refresh', null, { withCredentials: true })
    .then((r) => {
      setAccessToken(r.data.data.accessToken);
      return r.data.data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        if (window.location.pathname.startsWith('/admin')) window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** Mensagem amigável a partir do erro da API. */
export function apiErrorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.') {
  const e = err as AxiosError<{ message?: string }>;
  return e?.response?.data?.message ?? fallback;
}

export { api };
