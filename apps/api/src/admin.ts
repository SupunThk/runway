import { Hono } from 'hono';
import { isAddress, zeroAddress } from 'viem';
import type { Db } from 'mongodb';
import { adminOverview } from './admin-metrics.ts';
import { recordAdminAccess } from './admin-insights.ts';

const CACHE_MS = 30_000;

/** Invalid or absent configuration denies every wallet; no browser-controlled role. */
export function parseAdminWallets(
  value: string | undefined,
): ReadonlySet<string> {
  if (!value?.trim()) return new Set();
  const entries = value.split(',').map((v) => v.trim());
  if (
    entries.length > 20 ||
    entries.some(
      (v) =>
        !isAddress(v, { strict: false }) || v.toLowerCase() === zeroAddress,
    )
  )
    return new Set();
  return new Set(entries.map((v) => v.toLowerCase()));
}
export function createAdminRoutes(options: {
  now: () => Date;
  wallets: () => ReadonlySet<string>;
  throttle: (db: Db, address: string, now: Date) => Promise<void>;
  /** Separate, stricter limit for operational actions. */
  actionThrottle?: (db: Db, now: Date) => Promise<void>;
  /** Runs one indexer batch; undefined when this host does not index. */
  runIndexer?: (db: Db) => Promise<boolean>;
}) {
  const app = new Hono<{ Variables: { db: Db; address: string } }>();
  // Aggregates are identical for every admin; a short cache keeps the 60 s
  // auto-refresh from re-running every count and the 5,000-schedule scan.
  const cache = new Map<
    string,
    { at: number; data: Awaited<ReturnType<typeof adminOverview>> }
  >();
  // The parent authenticates the revocable server session before mounting this router.
  app.use('*', async (c, next) => {
    if (!options.wallets().has(c.get('address')?.toLowerCase()))
      return c.json(
        { error: 'This wallet is not authorized for the admin dashboard.' },
        403,
      );
    await options.throttle(c.get('db'), c.get('address'), options.now());
    try {
      await recordAdminAccess(c.get('db'), c.get('address'), options.now());
    } catch {
      console.warn('Admin access could not be recorded.');
    }
    await next();
  });
  app.get('/session', (c) =>
    c.json({
      address: c.get('address'),
      role: 'admin',
      access: 'read-only',
      actions: { reindex: Boolean(options.runIndexer) },
    }),
  );
  app.get('/overview', async (c) => {
    const days = c.req.query('days') ?? '30';
    if (!['7', '30', '90'].includes(days))
      return c.json({ error: 'Choose a 7, 30 or 90 day range.' }, 400);
    const instant = options.now();
    const cached = cache.get(days);
    if (
      c.req.query('fresh') !== '1' &&
      cached &&
      instant.getTime() - cached.at >= 0 &&
      instant.getTime() - cached.at < CACHE_MS
    )
      return c.json({ ...cached.data, cached: true });
    try {
      const data = await adminOverview(c.get('db'), instant, Number(days));
      cache.set(days, { at: instant.getTime(), data });
      return c.json({ ...data, cached: false });
    } catch {
      return c.json(
        { error: 'Admin metrics are unavailable. Retry shortly.' },
        503,
      );
    }
  });
  // The only admin write: ask the idempotent, lease-fenced indexer to run one
  // batch now. It cannot move funds or change customer records.
  app.post('/actions/reindex', async (c) => {
    if (!options.runIndexer)
      return c.json(
        { error: 'Payment indexing is not enabled on this server.' },
        503,
      );
    await options.actionThrottle?.(c.get('db'), options.now());
    try {
      const published = await options.runIndexer(c.get('db'));
      cache.clear();
      return c.json({ ok: true, published });
    } catch {
      return c.json(
        {
          error:
            'The indexer batch failed. The previous snapshot was kept; retry shortly.',
        },
        502,
      );
    }
  });
  return app;
}
