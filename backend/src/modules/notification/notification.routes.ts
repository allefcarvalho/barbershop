import { Router } from 'express';
import { notificationService } from './notification.service';
import { notificationFiltersSchema } from './notification.schema';
import { requireRole, MANAGERS } from '../../middlewares/auth.middleware';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse';

// Montado em /api/v1/notifications (autenticado). O envio é feito pelo worker (npm run worker).
const router = Router();

router.use(requireRole(...MANAGERS));

router.get('/', async (req, res) => {
  const r = await notificationService.list(req.auth!.tenantId, notificationFiltersSchema.parse(req.query));
  sendPaginated(res, r.notifications, r.total, r.page, r.pageSize);
});

router.post('/:id/retry', async (req, res) => {
  await notificationService.retry(req.auth!.tenantId, String(req.params.id));
  sendSuccess(res, null, 'Mensagem colocada na fila de novo');
});

export { router as notificationRoutes };
