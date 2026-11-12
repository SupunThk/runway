import { Hono } from 'hono';
import { isAddress, zeroAddress } from 'viem';
import type { Db } from 'mongodb';
import { adminOverview } from './admin-metrics.ts';

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
}) {
  const app = new Hono<{ Variables: { db: Db; address: string } }>();
  // The parent authenticates the revocable server session before mounting this router.
  app.use('*', async (c, next) => {
    if (!options.wallets().has(c.get('address')?.toLowerCase()))
      return c.json(
        { error: 'This wallet is not authorized for the admin dashboard.' },
        403,
      );
    await options.throttle(c.get('db'), c.get('address'), options.now());
    await next();
  });
  app.get('/session', (c) =>
    c.json({ address: c.get('address'), role: 'admin', access: 'read-only' }),
  );
  app.get('/overview', async (c) => {
    const days = c.req.query('days') ?? '30';
    if (!['7', '30', '90'].includes(days))
      return c.json({ error: 'Choose a 7, 30 or 90 day range.' }, 400);
    try {
      return c.json(
        await adminOverview(c.get('db'), options.now(), Number(days)),
      );
    } catch {
      return c.json(
        { error: 'Admin metrics are unavailable. Retry shortly.' },
        503,
      );
    }
  });
  return app;
}
