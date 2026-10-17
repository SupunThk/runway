import { database } from './db.ts';
import { indexBatch, rpcIndexSource } from './reconciliation.ts';

export function startPaymentWorker(
  options: { once?: boolean; onDone?: (failed: boolean) => void } = {},
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let running = false;
  async function tick() {
    running = true;
    let failed = false;
    try {
      await indexBatch(await database(), rpcIndexSource());
      failures = 0;
      console.log('Payment index batch completed.');
    } catch {
      failed = true;
      failures++;
      console.error('Payment index batch failed; checkpoint preserved.');
    }
    running = false;
    if (!options.once && !stopped)
      timer = setTimeout(
        () => void tick(),
        Math.min(60000, 5000 * 2 ** Math.min(failures, 4)),
      );
    else options.onDone?.(failed);
  }
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (!running) options.onDone?.(false);
  };
}
