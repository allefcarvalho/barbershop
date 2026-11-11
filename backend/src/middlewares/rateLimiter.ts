import rateLimit, { Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { env } from '../config/env';

// Com REDIS_URL o contador é compartilhado entre instâncias da API; sem ele, fica em memória (dev / instância única).
const redis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;

function limiter(prefix: string, windowMs: number, limit: number, message: string, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMITED' },
    skip: () => env.NODE_ENV === 'test',
    store: redis
      ? new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any })
      : undefined,
    ...extra,
  });
}

const MIN = 60 * 1000;

export const apiLimiter = limiter('api', 15 * MIN, 300, 'Muitas requisições. Tente novamente em alguns minutos.');

export const authLimiter = limiter('auth', 15 * MIN, 5, 'Muitas tentativas de login. Tente novamente em 15 minutos.', {
  skipSuccessfulRequests: true,
});

/** Agendamento público: protege a agenda contra bots. */
export const bookingLimiter = limiter('booking', 60 * MIN, 10, 'Muitos agendamentos deste dispositivo. Tente mais tarde.');
