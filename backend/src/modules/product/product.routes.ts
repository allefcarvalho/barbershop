import { Router } from 'express';
import { productService } from './product.service';
import { createProductSchema, updateProductSchema, stockMovementSchema } from './product.schema';
import { requireRole, MANAGERS, FRONT_DESK } from '../../middlewares/auth.middleware';
import { sendSuccess, sendCreated } from '../../utils/apiResponse';

// Montado em /api/v1/products (autenticado). A vitrine pública fica em public.routes.ts.
const router = Router();

router.use(requireRole(...FRONT_DESK));

router.get('/', async (req, res) => sendSuccess(res, await productService.list(req.auth!.tenantId)));
router.get('/low-stock', async (req, res) => sendSuccess(res, await productService.lowStock(req.auth!.tenantId)));
router.get('/:id', async (req, res) => sendSuccess(res, await productService.get(req.auth!.tenantId, String(req.params.id))));

router.post('/', requireRole(...MANAGERS), async (req, res) => {
  sendCreated(res, await productService.create(req.auth!.tenantId, createProductSchema.parse(req.body)), 'Produto criado');
});

router.put('/:id', requireRole(...MANAGERS), async (req, res) => {
  sendSuccess(res, await productService.update(req.auth!.tenantId, String(req.params.id), updateProductSchema.parse(req.body)), 'Produto atualizado');
});

router.delete('/:id', requireRole(...MANAGERS), async (req, res) => {
  sendSuccess(res, await productService.update(req.auth!.tenantId, String(req.params.id), { active: false }), 'Produto desativado');
});

router.post('/:id/stock', async (req, res) => {
  sendCreated(res, await productService.addStockMovement(req.auth!, String(req.params.id), stockMovementSchema.parse(req.body)), 'Movimentação registrada');
});

router.get('/:id/stock', async (req, res) => sendSuccess(res, await productService.stockHistory(req.auth!.tenantId, String(req.params.id))));

export { router as productRoutes };
