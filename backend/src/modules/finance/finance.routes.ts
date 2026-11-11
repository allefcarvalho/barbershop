import { Router } from 'express';
import { z } from 'zod';
import { financeService } from './finance.service';
import { reportsService } from './reports.service';
import {
  checkoutSchema, voidSchema, openRegisterSchema, cashMovementSchema, closeRegisterSchema, periodSchema, payCommissionSchema,
} from './finance.schema';
import { requireRole, MANAGERS, FRONT_DESK } from '../../middlewares/auth.middleware';
import { sendSuccess, sendCreated } from '../../utils/apiResponse';

// Montado em /api/v1 (autenticado): comandas, caixa, relatórios e comissões.
const router = Router();

// ===== Comandas =====
// Barbeiro pode cobrar os próprios atendimentos; o serviço confere a posse.
router.post('/orders', async (req, res) => {
  sendCreated(res, await financeService.checkout(req.auth!, checkoutSchema.parse(req.body)), 'Comanda fechada');
});

router.get('/orders', async (req, res) => {
  const { registerId } = z.object({ registerId: z.string().uuid() }).parse(req.query);
  sendSuccess(res, await financeService.listOrders(req.auth!, { registerId }));
});

router.post('/orders/:id/void', requireRole(...MANAGERS), async (req, res) => {
  const { reason } = voidSchema.parse(req.body);
  sendSuccess(res, await financeService.voidOrder(req.auth!, String(req.params.id), reason), 'Comanda estornada');
});

// ===== Caixa =====
router.get('/register', async (req, res) => sendSuccess(res, await financeService.currentRegister(req.auth!.tenantId)));

router.post('/register/open', requireRole(...FRONT_DESK), async (req, res) => {
  sendCreated(res, await financeService.open(req.auth!, openRegisterSchema.parse(req.body).openingCents), 'Caixa aberto');
});

router.post('/register/movements', requireRole(...FRONT_DESK), async (req, res) => {
  const m = cashMovementSchema.parse(req.body);
  sendSuccess(res, await financeService.addMovement(req.auth!, m.type, m.amountCents, m.reason), 'Movimentação registrada');
});

router.post('/register/close', requireRole(...FRONT_DESK), async (req, res) => {
  const c = closeRegisterSchema.parse(req.body);
  sendSuccess(res, await financeService.close(req.auth!, c.countedCashCents, c.notes), 'Caixa fechado');
});

router.get('/register/history', requireRole(...MANAGERS), async (req, res) => {
  sendSuccess(res, await financeService.registerHistory(req.auth!.tenantId));
});

// ===== Relatórios e comissões =====
router.get('/reports', requireRole(...MANAGERS), async (req, res) => {
  const p = periodSchema.parse(req.query);
  sendSuccess(res, await reportsService.summary(req.auth!.tenantId, p.from, p.to));
});

router.get('/commissions', async (req, res) => {
  const p = periodSchema.parse(req.query);
  sendSuccess(res, await reportsService.commissions(req.auth!, p.from, p.to));
});

router.post('/commissions/pay', requireRole(...MANAGERS), async (req, res) => {
  const p = payCommissionSchema.parse(req.body);
  sendSuccess(res, await reportsService.payCommission(req.auth!, p.barberId, p.from, p.to), 'Comissão marcada como paga');
});

export { router as financeRoutes };
