import { Router } from 'express';
import { z } from 'zod';
import { serviceService } from './service/service.service';
import { barberService } from './barber/barber.service';
import { productService } from './product/product.service';
import { availabilityService } from './availability/availability.service';
import { bookingService } from './booking/booking.service';
import { slotsQuerySchema } from './availability/availability.schema';
import { createBookingSchema, waitlistSchema } from './booking/booking.schema';
import { bookingLimiter } from '../middlewares/rateLimiter';
import { sendSuccess, sendCreated, HttpError } from '../utils/apiResponse';
import { prisma } from '../config/database';

/**
 * TODA a superfície pública da API, montada em /api/v1/public/:slug.
 * req.tenant vem do slug (middleware publicTenant). Revise este arquivo ao expor algo novo.
 */
const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  const t = req.tenant!;
  // Dias da semana em que algum barbeiro atende (o front não precisa fixar "domingo fechado").
  const days = await prisma.availability.findMany({
    where: { active: true, membership: { tenantId: t.id, active: true } },
    select: { dayOfWeek: true },
    distinct: ['dayOfWeek'],
  });
  sendSuccess(res, {
    slug: t.slug,
    name: t.name,
    timezone: t.timezone,
    maxAdvanceDays: t.maxAdvanceDays,
    openDays: days.map((d) => d.dayOfWeek).sort(),
  });
});

router.get('/services', async (req, res) => {
  const services = await serviceService.list(req.tenant!.id, true);
  sendSuccess(res, services.map(({ id, name, description, priceCents, durationMinutes, imageUrl }) => ({ id, name, description, priceCents, durationMinutes, imageUrl })));
});

router.get('/barbers', async (req, res) => {
  const { serviceId } = z.object({ serviceId: z.string().uuid().optional() }).parse(req.query);
  sendSuccess(res, await barberService.listPublic(req.tenant!.id, serviceId));
});

router.get('/barbers/:barberId/slots', async (req, res) => {
  const { date, serviceId } = slotsQuerySchema.parse(req.query);
  const slots = await availabilityService.getSlots(req.tenant!, String(req.params.barberId), date, serviceId);
  sendSuccess(res, slots.map((time) => ({ time, available: true })));
});

router.get('/products', async (req, res) => sendSuccess(res, await productService.listPublic(req.tenant!.id)));

router.post('/bookings', bookingLimiter, async (req, res) => {
  const booking = await bookingService.createPublic(req.tenant!, createBookingSchema.parse(req.body));
  sendCreated(res, booking, booking.status === 'PENDING' ? 'Agendamento recebido! A barbearia vai confirmar.' : 'Agendamento confirmado!');
});

// Link "gerenciar agendamento": o token vai no corpo (não na URL) para não aparecer em logs de acesso.
const manageSchema = z.object({ token: z.string().min(20).max(100) });

router.post('/bookings/manage', bookingLimiter, async (req, res) => {
  const { view } = await bookingService.findByManageToken(req.tenant!, manageSchema.parse(req.body).token);
  sendSuccess(res, view);
});

router.post('/bookings/manage/cancel', bookingLimiter, async (req, res) => {
  sendSuccess(res, await bookingService.cancelByClient(req.tenant!, manageSchema.parse(req.body).token), 'Agendamento cancelado');
});

/** Lista de espera: o cliente é avisado no WhatsApp se abrir vaga naquele dia. */
router.post('/waitlist', bookingLimiter, async (req, res) => {
  const t = req.tenant!;
  const data = waitlistSchema.parse(req.body);
  const service = await prisma.service.findFirst({ where: { id: data.serviceId, tenantId: t.id, active: true } });
  if (!service) throw new HttpError(404, 'Serviço não encontrado', 'SERVICE_NOT_FOUND');
  if (data.barberId && !(await prisma.membership.findFirst({ where: { id: data.barberId, tenantId: t.id, active: true } }))) {
    throw new HttpError(404, 'Barbeiro não encontrado', 'BARBER_NOT_FOUND');
  }
  const client = await prisma.client.upsert({
    where: { tenantId_phone: { tenantId: t.id, phone: data.clientPhone } },
    // Não desfaz um "SAIR": senão qualquer pessoa reativaria mensagens para o número de outra.
    update: { consentAt: new Date() },
    create: { tenantId: t.id, name: data.clientName, phone: data.clientPhone, consentAt: new Date() },
  });
  await prisma.waitlistEntry.upsert({
    where: { clientId_serviceId_date: { clientId: client.id, serviceId: service.id, date: new Date(data.date) } },
    update: { barberId: data.barberId ?? null, notifiedAt: null },
    create: { tenantId: t.id, clientId: client.id, serviceId: service.id, barberId: data.barberId, date: new Date(data.date) },
  });
  sendCreated(res, null, 'Pronto! Avisamos no seu WhatsApp se abrir um horário.');
});

export { router as publicRoutes };
