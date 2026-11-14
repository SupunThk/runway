import { createHash } from 'node:crypto';
import { MongoServerError, type Db, type UpdateFilter } from 'mongodb';

const DAY = 86_400_000;
const day = (now: Date) => now.toISOString().slice(0, 10);

async function upsertCounter<T extends { _id: string }>(
  db: Db,
  collection: string,
  _id: string,
  update: UpdateFilter<T>,
) {
  const rows = db.collection<T>(collection);
  try {
    await rows.updateOne({ _id } as never, update, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
    await rows.updateOne({ _id } as never, update);
  }
}

/** Source ids become Mongo field names; keep them bounded and dot-free. */
const sourceKey = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 60);

type AssistantDay = {
  _id: string;
  day: string;
  questions: number;
  failed: number;
  kinds: Record<string, number>;
  sources: Record<string, number>;
  /** Sections the model found closest when it could not answer: knowledge gaps. */
  gaps?: Record<string, number>;
  lookups?: number;
  ratings?: { up?: number; down?: number };
  /** Thumbs-down counts per cited section. */
  downSources?: Record<string, number>;
  totalMs: number;
  expiresAt: Date;
};
const assistantDay = (db: Db, now: Date, inc: Record<string, number>) =>
  upsertCounter<AssistantDay>(db, 'assistantMetrics', day(now), {
    $setOnInsert: {
      day: day(now),
      expiresAt: new Date(now.getTime() + 90 * DAY),
    },
    $inc: inc,
  } as UpdateFilter<AssistantDay>);
const sourceIncrements = (
  prefix: string,
  ids: string[] | undefined,
  inc: Record<string, number>,
) => {
  for (const id of new Set((ids ?? []).slice(0, 10).map(sourceKey)))
    if (id) inc[`${prefix}.${id}`] = 1;
};
export async function recordAssistantMetric(
  db: Db,
  result: {
    kind?: string;
    sources?: string[];
    gaps?: string[];
    lookup?: boolean;
    failed?: boolean;
  },
  durationMs: number,
  now: Date,
) {
  const inc: Record<string, number> = {
    questions: 1,
    failed: result.failed ? 1 : 0,
    totalMs: Math.max(0, Math.min(120_000, Math.round(durationMs))),
  };
  if (result.kind && /^[a-z_]{1,30}$/.test(result.kind))
    inc[`kinds.${result.kind}`] = 1;
  if (result.lookup) inc.lookups = 1;
  sourceIncrements('sources', result.sources, inc);
  sourceIncrements('gaps', result.gaps, inc);
  await assistantDay(db, now, inc);
}
/** Anonymous answer rating: no question or answer text, only kind and cited section IDs. */
export async function recordAssistantFeedback(
  db: Db,
  feedback: { rating: 'up' | 'down'; sources: string[] },
  now: Date,
) {
  const inc: Record<string, number> = { [`ratings.${feedback.rating}`]: 1 };
  if (feedback.rating === 'down')
    sourceIncrements('downSources', feedback.sources, inc);
  await assistantDay(db, now, inc);
}

type AdminAccess = {
  _id: string;
  wallet: string;
  day: string;
  requests: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};
export async function recordAdminAccess(db: Db, wallet: string, now: Date) {
  const address = wallet.toLowerCase();
  const _id = createHash('sha256')
    .update(`${address}:${day(now)}`)
    .digest('hex');
  await upsertCounter<AdminAccess>(db, 'adminAccess', _id, {
    $setOnInsert: {
      wallet: address,
      day: day(now),
      firstSeenAt: now,
      expiresAt: new Date(now.getTime() + 90 * DAY),
    },
    $max: { lastSeenAt: now },
    $inc: { requests: 1 },
  });
}

/** One row per backend process start. On a free host each start is a cold start. */
export async function recordServiceStart(db: Db, now: Date) {
  await db
    .collection<{ _id: string; startedAt: Date; expiresAt: Date }>(
      'serviceStarts',
    )
    .insertOne({
      _id: `${now.toISOString()}:${Math.random().toString(36).slice(2, 10)}`,
      startedAt: now,
      expiresAt: new Date(now.getTime() + 90 * DAY),
    });
}

export const shortWallet = (wallet: string) =>
  `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

export async function assistantSummary(
  db: Db,
  firstDay: string,
  today: string,
) {
  const rows = await db
    .collection<AssistantDay>('assistantMetrics')
    .find({ day: { $gte: firstDay, $lte: today } })
    .limit(400)
    .toArray();
  let questions = 0,
    failed = 0,
    totalMs = 0,
    lookups = 0,
    up = 0,
    down = 0;
  const kinds: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const gaps: Record<string, number> = {};
  const downSources: Record<string, number> = {};
  const add = (into: Record<string, number>, from?: Record<string, number>) => {
    for (const [k, v] of Object.entries(from ?? {}))
      into[k] = (into[k] ?? 0) + v;
  };
  for (const row of rows) {
    questions += row.questions ?? 0;
    failed += row.failed ?? 0;
    totalMs += row.totalMs ?? 0;
    lookups += row.lookups ?? 0;
    up += row.ratings?.up ?? 0;
    down += row.ratings?.down ?? 0;
    add(kinds, row.kinds);
    add(sources, row.sources);
    add(gaps, row.gaps);
    add(downSources, row.downSources);
  }
  const rate = (n: number) => (questions ? n / questions : null);
  const gapIds = new Set([...Object.keys(gaps), ...Object.keys(downSources)]);
  return {
    questions,
    failed,
    answered: kinds.answer ?? 0,
    declined:
      (kinds.out_of_scope ?? 0) +
      (kinds.unsupported ?? 0) +
      (kinds.live_data ?? 0),
    averageMs: questions ? Math.round(totalMs / questions) : null,
    lookups,
    rates: {
      unsupported: rate(kinds.unsupported ?? 0),
      outOfScope: rate(kinds.out_of_scope ?? 0),
      liveData: rate(kinds.live_data ?? 0),
    },
    ratings: { up, down },
    topSources: Object.entries(sources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, citations]) => ({ id, citations })),
    gapSources: [...gapIds]
      .map((id) => ({
        id,
        unanswered: gaps[id] ?? 0,
        downvotes: downSources[id] ?? 0,
      }))
      .sort((a, b) => b.unanswered + b.downvotes - (a.unanswered + a.downvotes))
      .slice(0, 8),
    daily: rows
      .map((row) => ({ date: row.day, questions: row.questions ?? 0 }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function invoiceFunnel(db: Db) {
  const invoices = db.collection('invoices');
  const [
    created,
    contractorSubmitted,
    rejected,
    reviewed,
    inPayrollRun,
    paymentLinked,
    timings,
  ] = await Promise.all([
    invoices.countDocuments(),
    invoices.countDocuments({ submittedBy: { $exists: true } }),
    invoices.countDocuments({ reviewRejected: { $exists: true } }),
    db
      .collection('workspaceReviews')
      .aggregate<{ count: number }>([
        {
          $match: {
            _id: { $regex: ':invoice:' },
            'approvals.0': { $exists: true },
          },
        },
        { $group: { _id: { $arrayElemAt: [{ $split: ['$_id', ':'] }, 2] } } },
        { $count: 'count' },
      ])
      .toArray(),
    db
      .collection('payrollRuns')
      .aggregate<{ count: number }>([
        { $unwind: '$invoiceIds' },
        { $group: { _id: '$invoiceIds' } },
        { $count: 'count' },
      ])
      .toArray(),
    invoices.countDocuments({
      $or: [
        { transactionHash: { $exists: true } },
        { scheduleId: { $exists: true } },
      ],
    }),
    db
      .collection('settlementClaims')
      .aggregate<{ linkedAt: Date; createdAt?: string }>([
        { $match: { targetType: 'invoice' } },
        { $sort: { createdAt: -1 } },
        { $limit: 2000 },
        {
          $lookup: {
            from: 'invoices',
            localField: 'targetId',
            foreignField: '_id',
            as: 'invoice',
            pipeline: [{ $project: { _id: 0, createdAt: 1 } }],
          },
        },
        {
          $project: {
            _id: 0,
            linkedAt: '$createdAt',
            createdAt: { $first: '$invoice.createdAt' },
          },
        },
      ])
      .toArray(),
  ]);
  const hours = timings
    .map((row) => {
      const start = Date.parse(row.createdAt ?? '');
      const end = row.linkedAt instanceof Date ? row.linkedAt.getTime() : NaN;
      return Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? (end - start) / 3_600_000
        : null;
    })
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const median = hours.length
    ? hours.length % 2
      ? hours[(hours.length - 1) / 2]
      : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2
    : null;
  return {
    created,
    contractorSubmitted,
    reviewed: reviewed[0]?.count ?? 0,
    rejected,
    inPayrollRun: inPayrollRun[0]?.count ?? 0,
    paymentLinked,
    medianHoursToPayment: median === null ? null : Math.round(median * 10) / 10,
    timedSamples: hours.length,
  };
}

export async function serviceStarts(db: Db, now: Date, from: Date) {
  const rows = await db
    .collection<{ startedAt: Date }>('serviceStarts')
    .find(
      { startedAt: { $gte: from } },
      { projection: { _id: 0, startedAt: 1 } },
    )
    .sort({ startedAt: -1 })
    .limit(2000)
    .toArray();
  const dayAgo = now.getTime() - DAY;
  return {
    inRange: rows.length,
    last24Hours: rows.filter((r) => r.startedAt.getTime() >= dayAgo).length,
    lastStartedAt: rows[0]?.startedAt.toISOString() ?? null,
    byDay: rows.reduce<Record<string, number>>((acc, row) => {
      const key = day(row.startedAt);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export async function recentAdminAccess(db: Db) {
  const rows = await db
    .collection<AdminAccess>('adminAccess')
    .find(
      {},
      { projection: { _id: 0, wallet: 1, day: 1, requests: 1, lastSeenAt: 1 } },
    )
    .sort({ lastSeenAt: -1 })
    .limit(14)
    .toArray();
  return rows.map((row) => ({
    wallet: shortWallet(row.wallet),
    day: row.day,
    requests: row.requests,
    lastSeenAt: row.lastSeenAt.toISOString(),
  }));
}

export type AdminAlert = {
  level: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
};
