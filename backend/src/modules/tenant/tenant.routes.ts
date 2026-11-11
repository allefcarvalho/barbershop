import { Router } from 'express';
import { z } from 'zod';
import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { requireRole, MANAGERS, FRONT_DESK } from '../../middlewares/auth.middleware';
import { sendSuccess } from '../../utils/apiResponse';
import { dayRangeUtc, utcToZoned } from '../../utils/time';

// Montado em /api/v1 (autenticado): /settings e /dashboard da barbearia do token.
const router = Router();

const settingsSelect = {
  slug: true,
  name: true,
  timezone: true,
  slotStepMinutes: true,
  minAdvanceMinutes: true,
  maxAdvanceDays: true,
  clientCancelMinHours: true,
  recurringThreshold: true,
  maxActiveBookingsPerPhone: true,
  requireConfirmation: true,
} satisfies Prisma.TenantSelect;

const isTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  timezone: z.string().refine(isTimezone, 'Fuso horário inválido'),
  slotStepMinutes: z.number().int().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), 'Use 5, 10, 15, 20, 30 ou 60'),
  minAdvanceMinutes: z.number().int().min(0).max(7 * 24 * 60),
  maxAdvanceDays: z.number().int().min(1).max(365),
  clientCancelMinHours: z.number().int().min(0).max(168),
  recurringThreshold: z.number().int().min(1).max(100),
  maxActiveBookingsPerPhone: z.number().int().min(1).max(20),
  requireConfirmation: z.boolean(),
});

router.get('/settings', requireRole(...FRONT_DESK), async (req, res) => {
  sendSuccess(res, await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId }, select: settingsSelect }));
});

router.put('/settings', requireRole(...MANAGERS), async (req, res) => {
  const data = settingsSchema.parse(req.body);
  sendSuccess(res, await prisma.tenant.update({ where: { id: req.auth!.tenantId }, data, select: settingsSelect }), 'Configurações salvas');
});

/** Números do dia. Barbeiro vê só os próprios; estoque baixo só para quem cuida do balcão. */
router.get('/dashboard', async (req, res) => {
  const auth = req.auth!;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId } });
  const now = new Date();
  const today = utcToZoned(now, tenant.timezone).date;
  const { start, end } = dayRangeUtc(today, tenant.timezone);
  const monthStart = dayRangeUtc(`${today.slice(0, 8)}01`, tenant.timezone).start;

  const scope: Prisma.BookingWhereInput = { tenantId: auth.tenantId, ...(auth.role === 'BARBER' ? { barberId: auth.membershipId } : {}) };
  const active: BookingStatus[] = ['PENDING', 'CONFIRMED'];

  const [byStatus, upcoming, monthByStatus, pending, lowStock] = await Promise.all([
    prisma.booking.groupBy({
      by: ['status'],
      where: { ...scope, startAt: { gte: start, lt: end } },
      _count: true,
      _sum: { priceCents: true },
    }),
    prisma.booking.findMany({
      where: { ...scope, startAt: { gte: now, lt: end }, status: { in: active } },
      include: { client: { select: { name: true } }, service: { select: { name: true } }, barber: { select: { user: { select: { name: true } } } } },
      orderBy: { startAt: 'asc' },
      take: 6,
    }),
    prisma.booking.groupBy({ by: ['status'], where: { ...scope, startAt: { gte: monthStart, lt: end } }, _count: true }),
    prisma.booking.count({ where: { ...scope, status: 'PENDING', startAt: { gte: now } } }),
    FRONT_DESK.includes(auth.role)
      ? prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM products WHERE tenant_id = ${auth.tenantId} AND active AND stock_quantity <= stock_min`
      : Promise.resolve(null),
  ]);

  const count = (s: BookingStatus) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const sum = (statuses: BookingStatus[]) => byStatus.filter((r) => statuses.includes(r.status)).reduce((t, r) => t + (r._sum.priceCents ?? 0), 0);
  const month = (s: BookingStatus) => monthByStatus.find((r) => r.status === s)?._count ?? 0;
  const attended = month('COMPLETED') + month('NO_SHOW');

  sendSuccess(res, {
    date: today,
    today: {
      total: byStatus.reduce((t, r) => t + r._count, 0) - count('CANCELLED'),
      completed: count('COMPLETED'),
      remaining: count('PENDING') + count('CONFIRMED'),
      noShow: count('NO_SHOW'),
      cancelled: count('CANCELLED'),
      expectedCents: sum(['PENDING', 'CONFIRMED', 'COMPLETED']),
      completedCents: sum(['COMPLETED']),
    },
    pendingConfirmation: pending,
    month: { completed: month('COMPLETED'), noShowRate: attended ? month('NO_SHOW') / attended : 0 },
    lowStock: lowStock ? Number(lowStock[0].n) : null,
    upcoming: upcoming.map((b) => ({
      id: b.id,
      time: utcToZoned(b.startAt, tenant.timezone).time,
      client: b.client.name,
      service: b.service.name,
      barber: b.barber.user.name,
      status: b.status,
    })),
  });
});

export { router as tenantRoutes };
