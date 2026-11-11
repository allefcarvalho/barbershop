// Worker de mensagens: processo separado da API (npm run worker).
// Pode rodar mais de uma instância: a fila no Postgres usa FOR UPDATE SKIP LOCKED.
import { prisma } from './config/database';
import { processDue } from './modules/notification/queue';

const INTERVAL_MS = 15_000;
let running = true;

async function loop() {
  console.log('📨 Worker de mensagens iniciado');
  while (running) {
    try {
      // Esvazia o que está vencido em lotes; quando sobra pouco, espera o próximo ciclo.
      let r;
      do {
        r = await processDue(50);
        if (r.claimed) console.log(`[worker] ${r.sent}/${r.claimed} enviada(s)`);
      } while (running && r.claimed === 50);
    } catch (e) {
      console.error('[worker] erro no ciclo:', e);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  await prisma.$disconnect();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => (running = false));
loop();
