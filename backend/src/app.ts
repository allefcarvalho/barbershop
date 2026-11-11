import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProd } from './config/env';
import { prisma } from './config/database';
import { errorHandler } from './middlewares/errorHandler';
import { apiLimiter } from './middlewares/rateLimiter';
import { authenticate, publicTenant } from './middlewares/auth.middleware';
import { sendSuccess, sendError } from './utils/apiResponse';
import { authRoutes } from './modules/auth/auth.routes';
import { publicRoutes } from './modules/public.routes';
import { serviceRoutes } from './modules/service/service.routes';
import { barberRoutes } from './modules/barber/barber.routes';
import { availabilityRoutes } from './modules/availability/availability.routes';
import { bookingRoutes } from './modules/booking/booking.routes';
import { clientRoutes } from './modules/client/client.routes';
import { productRoutes } from './modules/product/product.routes';
import { notificationRoutes } from './modules/notification/notification.routes';

const app = express();

app.set('trust proxy', env.TRUST_PROXY); // IP real do cliente atrás do load balancer (rate limit correto)
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json({ limit: '100kb' }));
if (env.NODE_ENV !== 'test') app.use(morgan(isProd ? 'combined' : 'dev'));

// Liveness/readiness para o load balancer (fora do rate limit).
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    sendSuccess(res, { status: 'ok' });
  } catch {
    sendError(res, 'Banco indisponível', 503);
  }
});

app.use('/api', apiLimiter);

const v1 = express.Router();
v1.use('/auth', authRoutes);
v1.use('/public/:slug', publicTenant, publicRoutes);

// Daqui para baixo: autenticado, tenant vem do token.
v1.use(authenticate);
v1.use('/services', serviceRoutes);
v1.use('/barbers', barberRoutes);
v1.use('/availability', availabilityRoutes);
v1.use('/bookings', bookingRoutes);
v1.use('/clients', clientRoutes);
v1.use('/products', productRoutes);
v1.use('/notifications', notificationRoutes);

app.use('/api/v1', v1);
app.use('/api', (_req, res) => sendError(res, 'Rota não encontrada', 404, 'NOT_FOUND'));
app.use(errorHandler);

export { app };
