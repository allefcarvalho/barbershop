import { Router } from 'express';
import { availabilityService } from './availability.service';
import { setAvailabilitySchema, createExceptionSchema } from './availability.schema';
import { assertSelfOr } from '../../middlewares/auth.middleware';
import { sendSuccess, sendCreated } from '../../utils/apiResponse';

// Montado em /api/v1/availability (autenticado). Barbeiro só mexe na própria agenda; dono/gerente em todas.
const router = Router();

router.get('/:barberId', async (req, res) => {
  sendSuccess(res, await availabilityService.getSchedule(req.auth!.tenantId, req.params.barberId));
});

router.put('/:barberId', async (req, res) => {
  assertSelfOr(req.auth!, req.params.barberId);
  const data = setAvailabilitySchema.parse(req.body);
  sendSuccess(res, await availabilityService.setSchedule(req.auth!.tenantId, req.params.barberId, data), 'Disponibilidade atualizada');
});

router.get('/:barberId/exceptions', async (req, res) => {
  sendSuccess(res, await availabilityService.getExceptions(req.auth!.tenantId, req.params.barberId));
});

router.post('/:barberId/exceptions', async (req, res) => {
  assertSelfOr(req.auth!, req.params.barberId);
  const data = createExceptionSchema.parse(req.body);
  sendCreated(res, await availabilityService.upsertException(req.auth!.tenantId, req.params.barberId, data), 'Exceção salva');
});

router.delete('/:barberId/exceptions/:id', async (req, res) => {
  assertSelfOr(req.auth!, req.params.barberId);
  await availabilityService.deleteException(req.auth!.tenantId, req.params.barberId, req.params.id);
  sendSuccess(res, null, 'Exceção removida');
});

export { router as availabilityRoutes };
