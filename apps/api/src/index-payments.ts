import { startPaymentWorker } from './payment-worker.ts';

const stop = startPaymentWorker({
  once: process.argv.includes('--once'),
  onDone: (failed) => process.exit(failed ? 1 : 0),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop);
