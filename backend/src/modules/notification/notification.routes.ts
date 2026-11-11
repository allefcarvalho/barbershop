import { Router } from 'express';
import { notificationService } from './notification.service';
import { notificationFiltersSchema } from './notification.schema';
import { requireRole, MANAGERS } from '../../middlewares/auth.middleware';
import { sendSuccess, sendPaginated } from '../../utils/apiResponse';

// Montado em /api/v1/notifications (autenticado). O webhook do WhatsApp volta na Fase 3, com verificação de assinatura.
const router = Router();

router.use(requireRole(...MANAGERS));

router.get('/', async (req, res) => {
  const r = await notificationService.list(req.auth!.tenantId, notificationFiltersSchema.parse(req.query));
  sendPaginated(res, r.notifications, r.total, r.page, r.pageSize);
});

router.post('/process', async (req, res) => sendSuccess(res, await notificationService.processPending(req.auth!.tenantId)));

export { router as notificationRoutes };
