import { Router } from 'express';
import { barberService } from './barber.service';
import { createBarberSchema, updateBarberSchema } from './barber.schema';
import { requireRole, assertSelfOr, MANAGERS, AuthContext } from '../../middlewares/auth.middleware';
import { sendSuccess, sendCreated, HttpError } from '../../utils/apiResponse';

// Montado em /api/v1/barbers (autenticado). "Barbeiro" = membro da equipe.
const router = Router();

function assertCanGrant(auth: AuthContext, role?: string) {
  if (role === 'OWNER' && auth.role !== 'OWNER') throw new HttpError(403, 'Somente o dono define outro dono', 'FORBIDDEN');
}

router.get('/', async (req, res) => sendSuccess(res, await barberService.list(req.auth!.tenantId)));

router.get('/:id', async (req, res) => sendSuccess(res, await barberService.findById(req.auth!.tenantId, String(req.params.id))));

router.post('/', requireRole(...MANAGERS), async (req, res) => {
  const data = createBarberSchema.parse(req.body);
  assertCanGrant(req.auth!, data.role);
  sendCreated(res, await barberService.create(req.auth!.tenantId, data), 'Membro cadastrado');
});

router.put('/:id', async (req, res) => {
  assertSelfOr(req.auth!, String(req.params.id));
  const data = updateBarberSchema.parse(req.body);
  assertCanGrant(req.auth!, data.role);
  const managed = MANAGERS.includes(req.auth!.role);
  sendSuccess(res, await barberService.update(req.auth!.tenantId, String(req.params.id), data, managed), 'Atualizado');
});

router.delete('/:id', requireRole(...MANAGERS), async (req, res) => {
  sendSuccess(res, await barberService.update(req.auth!.tenantId, String(req.params.id), { active: false }, true), 'Desativado');
});

export { router as barberRoutes };
