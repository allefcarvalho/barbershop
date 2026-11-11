import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().default(3333),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
  /** Nº de proxies confiáveis à frente da API (load balancer). 0 = nenhum. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Endereço do site (links enviados ao cliente). */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  // WhatsApp Cloud API (Meta). Sem token, as mensagens só vão para o log (canal interno).
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(), // valida a assinatura do webhook
  WHATSAPP_VERIFY_TOKEN: z.string().optional(), // verificação do webhook no painel da Meta
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
