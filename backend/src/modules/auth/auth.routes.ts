import { Router, Request, Response, CookieOptions } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { authenticate } from '../../middlewares/auth.middleware';
import { authLimiter } from '../../middlewares/rateLimiter';
import { sendSuccess } from '../../utils/apiResponse';
import { env, isProd } from '../../config/env';

const router = Router();

// Refresh token só em cookie httpOnly (JS do navegador não lê → XSS não rouba a sessão).
const COOKIE = 'rt';
const cookieOpts: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000,
};

function readCookie(req: Request): string | undefined {
  const m = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m?.[1];
}

function sendSession(res: Response, s: { accessToken: string; refreshToken: string; user: unknown }, message?: string) {
  res.cookie(COOKIE, s.refreshToken, cookieOpts);
  return sendSuccess(res, { accessToken: s.accessToken, user: s.user }, message);
}

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
  tenantSlug: z.string().optional(),
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password, tenantSlug } = loginSchema.parse(req.body);
  try {
    return sendSession(res, await authService.login(email, password, tenantSlug), 'Login realizado');
  } catch (e: any) {
    if (e.code === 'CHOOSE_TENANT') {
      return res.status(409).json({ success: false, message: e.message, code: e.code, data: { tenants: e.tenants } });
    }
    throw e;
  }
});

router.post('/refresh', async (req, res) => {
  try {
    return sendSession(res, await authService.refresh(readCookie(req)));
  } catch (e) {
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
    throw e;
  }
});

router.post('/logout', async (req, res) => {
  await authService.logout(readCookie(req));
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
  return sendSuccess(res, null, 'Sessão encerrada');
});

router.get('/me', authenticate, async (req, res) => sendSuccess(res, await authService.me(req.auth!)));

export { router as authRoutes };
