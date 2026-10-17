import { serve } from '@hono/node-server';
import app from './app.ts';
import { startPaymentWorker } from './payment-worker.ts';

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const hostname = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT or API_PORT.');
const server = serve({ fetch: app.fetch, hostname, port }, () => {
  console.log(`Runway API listening on http://${hostname}:${port}`);
});
const stopIndexer =
  process.env.PAYMENT_INDEXER_ENABLED === 'true'
    ? startPaymentWorker()
    : undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopIndexer?.();
    server.close(() => process.exit(0));
  });
}
