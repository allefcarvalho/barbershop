import { Router } from 'express';
import { z } from 'zod';
import { serviceService } from './service/service.service';
import { barberService } from './barber/barber.service';
import { productService } from './product/product.service';
import { availabilityService } from './availability/availability.service';
import { bookingService } from './booking/booking.service';
import { slotsQuerySchema } from './availability/availability.schema';
import { createBookingSchema } from './booking/booking.schema';
import { bookingLimiter } from '../middlewares/rateLimiter';
import { sendSuccess, sendCreated } from '../utils/apiResponse';
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
  const booking = await bookingService.create(req.tenant!, createBookingSchema.parse(req.body));
  sendCreated(res, booking, 'Agendamento confirmado!');
});

export { router as publicRoutes };
