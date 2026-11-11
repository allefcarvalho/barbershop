import { Router } from 'express';
import { clientService } from './client.service';
import { updateClientSchema, clientFiltersSchema } from './client.schema';
import { requireRole, FRONT_DESK } from '../../middlewares/auth.middleware';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse';

// Montado em /api/v1/clients (autenticado).
const router = Router();

router.get('/', async (req, res) => {
  const r = await clientService.list(req.auth!, clientFiltersSchema.parse(req.query));
  sendPaginated(res, r.clients, r.total, r.page, r.pageSize);
});

router.get('/:id', async (req, res) => sendSuccess(res, await clientService.get(req.auth!, String(req.params.id))));

router.put('/:id', requireRole(...FRONT_DESK), async (req, res) => {
  sendSuccess(res, await clientService.update(req.auth!, String(req.params.id), updateClientSchema.parse(req.body)), 'Cliente atualizado');
});

export { router as clientRoutes };
