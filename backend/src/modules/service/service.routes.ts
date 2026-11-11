import { Router } from 'express';
import { serviceService } from './service.service';
import { createServiceSchema, updateServiceSchema } from './service.schema';
import { requireRole, MANAGERS } from '../../middlewares/auth.middleware';
import { sendSuccess, sendCreated } from '../../utils/apiResponse';

// Montado em /api/v1/services (autenticado). A lista pública fica em public.routes.ts.
const router = Router();

router.get('/', async (req, res) => sendSuccess(res, await serviceService.list(req.auth!.tenantId, false)));

router.get('/:id', async (req, res) => sendSuccess(res, await serviceService.get(req.auth!.tenantId, String(req.params.id))));

router.post('/', requireRole(...MANAGERS), async (req, res) => {
  sendCreated(res, await serviceService.create(req.auth!.tenantId, createServiceSchema.parse(req.body)), 'Serviço criado');
});

router.put('/:id', requireRole(...MANAGERS), async (req, res) => {
  sendSuccess(res, await serviceService.update(req.auth!.tenantId, String(req.params.id), updateServiceSchema.parse(req.body)), 'Serviço atualizado');
});

router.delete('/:id', requireRole(...MANAGERS), async (req, res) => {
  sendSuccess(res, await serviceService.update(req.auth!.tenantId, String(req.params.id), { active: false }), 'Serviço desativado');
});

export { router as serviceRoutes };
