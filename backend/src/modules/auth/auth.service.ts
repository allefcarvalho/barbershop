import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { HttpError } from '../../utils/apiResponse';
import { signAccessToken, AuthContext } from '../../middlewares/auth.middleware';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Hash fixo para comparar quando o e-mail não existe: resposta leva o mesmo tempo (não revela e-mails cadastrados).
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);
const invalid = () => new HttpError(401, 'Credenciais inválidas', 'INVALID_CREDENTIALS');

async function issueSession(ctx: AuthContext, familyId: string = randomUUID()) {
  const refreshToken = randomBytes(32).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000),
    },
  });
  return { accessToken: signAccessToken(ctx), refreshToken };
}

const revokeFamily = (familyId: string) =>
  prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });

export const authService = {
  async login(email: string, password: string, tenantSlug?: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: { where: { active: true, tenant: { active: true } }, include: { tenant: true } } },
    });

    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.active) throw invalid();

    const memberships = tenantSlug ? user.memberships.filter((m) => m.tenant.slug === tenantSlug) : user.memberships;
    if (memberships.length === 0) throw invalid();
    if (memberships.length > 1) {
      // Usuário em várias barbearias: o front pergunta qual e repete o login com tenantSlug.
      throw Object.assign(new HttpError(409, 'Escolha a barbearia', 'CHOOSE_TENANT'), {
        tenants: memberships.map((m) => ({ slug: m.tenant.slug, name: m.tenant.name })),
      });
    }

    const m = memberships[0];
    const session = await issueSession({ userId: user.id, membershipId: m.id, tenantId: m.tenantId, role: m.role });
    return { ...session, user: this.profile(user, m) };
  },

  /** Rotação: cada refresh troca o token. Reusar um token já trocado = roubo provável → revoga a família toda. */
  async refresh(token: string | undefined) {
    if (!token) throw new HttpError(401, 'Sessão expirada', 'SESSION_EXPIRED');

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true, membership: { include: { tenant: true } } },
    });
    if (!stored) throw new HttpError(401, 'Sessão expirada', 'SESSION_EXPIRED');

    if (stored.revokedAt) {
      await revokeFamily(stored.familyId);
      throw new HttpError(401, 'Sessão encerrada por segurança. Faça login novamente.', 'TOKEN_REUSED');
    }

    // Revogação condicional: se duas requisições usarem o mesmo token ao mesmo tempo, só uma vence.
    const { count } = await prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await revokeFamily(stored.familyId);
      throw new HttpError(401, 'Sessão encerrada por segurança. Faça login novamente.', 'TOKEN_REUSED');
    }

    const { user, membership: m } = stored;
    if (stored.expiresAt < new Date() || !user.active || !m.active || !m.tenant.active) {
      throw new HttpError(401, 'Sessão expirada', 'SESSION_EXPIRED');
    }

    const session = await issueSession(
      { userId: user.id, membershipId: m.id, tenantId: m.tenantId, role: m.role },
      stored.familyId,
    );
    return { ...session, user: this.profile(user, m) };
  },

  async logout(token: string | undefined) {
    if (!token) return;
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (stored) await revokeFamily(stored.familyId);
  },

  async me(auth: AuthContext) {
    const m = await prisma.membership.findFirst({
      where: { id: auth.membershipId, active: true },
      include: { user: true, tenant: true },
    });
    if (!m) throw new HttpError(401, 'Sessão inválida', 'UNAUTHENTICATED');
    return this.profile(m.user, m);
  },

  profile(
    user: { id: string; name: string; email: string; avatarUrl: string | null },
    m: { id: string; role: string; tenant: { slug: string; name: string; timezone: string } },
  ) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      membershipId: m.id,
      role: m.role,
      tenant: { slug: m.tenant.slug, name: m.tenant.name, timezone: m.tenant.timezone },
    };
  },
};
