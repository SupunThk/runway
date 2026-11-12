import { MongoServerError, type Db } from 'mongodb';

const HOUR = 3_600_000;
const bounds = [100, 500, 1000, 5000, 15000, 60000];
type RequestMetric = {
  _id: string;
  hour: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  requests: number;
  serverErrors: number;
  clientErrors: number;
  totalMs: number;
  maxMs: number;
  buckets: Record<string, number>;
};

// Bounded categories deliberately exclude URLs, bearer links, wallets and bodies.
export function requestFamily(path: string) {
  if (
    path.startsWith('/api/workspaces') ||
    path.startsWith('/api/participation')
  )
    return 'workspace';
  if (path.startsWith('/api/pay/')) return 'payment-link';
  if (path.startsWith('/api/auth/')) return 'authentication';
  if (path === '/api/assistant/chat') return 'assistant';
  return undefined;
}
export async function recordRequestMetric(
  db: Db,
  family: string,
  status: number,
  duration: number,
  now: Date,
) {
  if (
    !['workspace', 'payment-link', 'authentication', 'assistant'].includes(
      family,
    )
  )
    return;
  const hour = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
  const elapsed = Math.max(0, Math.min(3_600_000, Math.round(duration)));
  const bucket = String(bounds.find((bound) => elapsed <= bound) ?? 'over');
  const collection = db.collection<RequestMetric>('requestMetrics');
  const update = {
    $setOnInsert: {
      hour,
      firstSeenAt: now,
      expiresAt: new Date(hour.getTime() + 90 * 24 * HOUR),
    },
    $max: { lastSeenAt: now, maxMs: elapsed },
    $inc: {
      requests: 1,
      serverErrors: status >= 500 ? 1 : 0,
      clientErrors: status >= 400 && status < 500 ? 1 : 0,
      totalMs: elapsed,
      [`buckets.${bucket}`]: 1,
    },
  };
  try {
    await collection.updateOne(
      { _id: `${hour.toISOString()}:${family}` },
      update,
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
    await collection.updateOne(
      { _id: `${hour.toISOString()}:${family}` },
      update,
    );
  }
}

export async function requestMetrics(db: Db, now: Date) {
  // Full UTC hour buckets, including the current incomplete hour.
  const from = new Date(Math.floor(now.getTime() / HOUR) * HOUR - 23 * HOUR);
  const records = await db
    .collection<RequestMetric>('requestMetrics')
    .find({ hour: { $gte: from, $lte: now } })
    .limit(96)
    .maxTimeMS(5000)
    .toArray();
  if (!records.length) return null;
  const sums = records.reduce(
    (a, r) => ({
      requests: a.requests + r.requests,
      serverErrors: a.serverErrors + r.serverErrors,
      clientErrors: a.clientErrors + r.clientErrors,
      totalMs: a.totalMs + r.totalMs,
    }),
    { requests: 0, serverErrors: 0, clientErrors: 0, totalMs: 0 },
  );
  let cumulative = 0;
  let p95UpperBoundMs: number | null = null;
  for (const bound of [...bounds.map(String), 'over']) {
    cumulative += records.reduce(
      (total, r) => total + (r.buckets?.[bound] ?? 0),
      0,
    );
    if (cumulative >= Math.ceil(sums.requests * 0.95)) {
      p95UpperBoundMs = bound === 'over' ? null : Number(bound);
      break;
    }
  }
  return {
    available: true,
    from: from.toISOString(),
    to: now.toISOString(),
    observedSince: new Date(
      Math.min(...records.map((r) => r.firstSeenAt.getTime())),
    ).toISOString(),
    requests: sums.requests,
    serverErrors: sums.serverErrors,
    clientErrors: sums.clientErrors,
    averageMs: sums.requests ? Math.round(sums.totalMs / sums.requests) : null,
    p95UpperBoundMs,
    maxMs: Math.max(...records.map((r) => r.maxMs)),
    note: 'Observed API requests in 24 UTC hour buckets; current hour is partial. Excludes health checks, admin refreshes and requests that cannot reach the database. Collection failures may undercount. p95 is a histogram upper bound; null means over 60 seconds.',
  };
}

/** Optional dated actual-cost record, never a forecast or an inferred bill. */
export function operatingCostRecord(
  raw = process.env.RUNWAY_COST_RECORD_JSON,
  now = new Date(),
) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value.kind !== 'actual' ||
      !/^\d{1,9}(\.\d{1,2})?$/.test(value.amountUsd) ||
      !['periodStart', 'periodEnd', 'recordedAt'].every(
        (key) =>
          typeof value[key] === 'string' &&
          Number.isFinite(Date.parse(value[key])),
      ) ||
      Date.parse(value.periodStart) >= Date.parse(value.periodEnd) ||
      Date.parse(value.periodEnd) > now.getTime() ||
      Date.parse(value.recordedAt) > now.getTime() ||
      Date.parse(value.recordedAt) < Date.parse(value.periodEnd) ||
      typeof value.source !== 'string' ||
      !value.source.trim() ||
      value.source.length > 120
    )
      return null;
    return {
      kind: 'actual' as const,
      amountUsd: value.amountUsd as string,
      periodStart: new Date(value.periodStart).toISOString(),
      periodEnd: new Date(value.periodEnd).toISOString(),
      recordedAt: new Date(value.recordedAt).toISOString(),
      source: value.source.trim() as string,
      stale: now.getTime() - Date.parse(value.periodEnd) > 30 * 24 * HOUR,
      note: 'Operator-supplied actual-cost record; not automatically metered or a forecast.',
    };
  } catch {
    return null;
  }
}
