import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { MemberRole, Tenant } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { HttpError } from '../utils/apiResponse';

/** Quem está chamando e em qual barbearia. O tenant SEMPRE vem daqui, nunca do body. */
export interface AuthContext {
  userId: string;
  membershipId: string;
  tenantId: string;
  role: MemberRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      tenant?: Tenant;
    }
  }
}

export const MANAGERS: MemberRole[] = ['OWNER', 'MANAGER'];
export const FRONT_DESK: MemberRole[] = ['OWNER', 'MANAGER', 'RECEPTIONIST'];

export function signAccessToken(ctx: AuthContext) {
  return jwt.sign(
    { sub: ctx.userId, mid: ctx.membershipId, tid: ctx.tenantId, role: ctx.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'], algorithm: 'HS256' },
  );
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Não autenticado', 'UNAUTHENTICATED'));

  try {
    const p = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    req.auth = { userId: p.sub!, membershipId: p.mid, tenantId: p.tid, role: p.role };
    next();
  } catch {
    next(new HttpError(401, 'Token inválido ou expirado', 'TOKEN_EXPIRED'));
  }
}

export function requireRole(...roles: MemberRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'Sem permissão para este recurso', 'FORBIDDEN'));
    }
    next();
  };
}

/** Permite se o recurso é do próprio usuário (membershipId) ou se o papel está na lista. */
export function assertSelfOr(auth: AuthContext, membershipId: string, roles: MemberRole[] = MANAGERS) {
  if (auth.membershipId !== membershipId && !roles.includes(auth.role)) {
    throw new HttpError(403, 'Você só pode alterar os seus próprios dados', 'FORBIDDEN');
  }
}

/** Rotas públicas: resolve a barbearia pelo slug da URL. */
export async function publicTenant(req: Request, _res: Response, next: NextFunction) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: String(req.params.slug) } });
  if (!tenant?.active) return next(new HttpError(404, 'Barbearia não encontrada', 'TENANT_NOT_FOUND'));
  req.tenant = tenant;
  next();
}
