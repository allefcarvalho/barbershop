// =============================================
// Barbearia Vikings — Prisma Client Singleton
// =============================================

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Erros já são tratados e registrados pelo errorHandler; logar aqui duplicaria (e poluiria com conflitos esperados).
    log: ['warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
