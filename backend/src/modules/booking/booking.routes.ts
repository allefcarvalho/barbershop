import { Router } from 'express';
import { bookingService } from './booking.service';
import { updateBookingStatusSchema, bookingFiltersSchema, staffBookingSchema, rescheduleSchema } from './booking.schema';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse';

// Montado em /api/v1/bookings (autenticado). A criação pública fica em public.routes.ts.
const router = Router();

router.get('/', async (req, res) => {
  const r = await bookingService.findAll(req.auth!, bookingFiltersSchema.parse(req.query));
  sendPaginated(res, r.bookings, r.total, r.page, r.pageSize);
});

router.post('/', async (req, res) => {
  sendCreated(res, await bookingService.createByStaff(req.auth!, staffBookingSchema.parse(req.body)), 'Agendamento criado');
});

router.get('/:id', async (req, res) => {
  sendSuccess(res, await bookingService.findById(req.auth!, req.params.id));
});

router.patch('/:id/status', async (req, res) => {
  const { status } = updateBookingStatusSchema.parse(req.body);
  sendSuccess(res, await bookingService.updateStatus(req.auth!, req.params.id, status), 'Status atualizado');
});

router.patch('/:id/reschedule', async (req, res) => {
  sendSuccess(res, await bookingService.reschedule(req.auth!, req.params.id, rescheduleSchema.parse(req.body)), 'Agendamento remarcado');
});

export { router as bookingRoutes };
