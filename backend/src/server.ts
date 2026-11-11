import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/database';

const server = app.listen(env.PORT, () => console.log(`✅ API em http://localhost:${env.PORT}/api (${env.NODE_ENV})`));

// Encerramento gracioso: termina requisições em andamento antes de sair (deploy sem derrubar ninguém).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
