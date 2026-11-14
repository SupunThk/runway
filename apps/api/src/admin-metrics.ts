import { createHash } from 'node:crypto';
import { estimateWorkspaceRevenueEquivalent } from '../../../packages/mezo/src/pricing.ts';
import { MongoServerError, type Db, type UpdateFilter } from 'mongodb';
import { operatingCostRecord, requestMetrics } from './operations.ts';
import {
  assistantSummary,
  invoiceFunnel,
  recentAdminAccess,
  serviceStarts,
  type AdminAlert,
} from './admin-insights.ts';
import {
  indexKey,
  reconciliationState,
  type IndexedSchedule,
  type IndexState,
} from './reconciliation.ts';

export type WorkspaceActivity = {
  _id: string;
  owner: string;
  day: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  requests: number;
  expiresAt: Date;
};
const DAY = 86_400_000;
export async function recordWorkspaceActivity(
  db: Db,
  owner: string,
  now: Date,
) {
  const day = now.toISOString().slice(0, 10);
  const key = createHash('sha256')
    .update(`${owner.toLowerCase()}:${day}`)
    .digest('hex');
  const update: UpdateFilter<WorkspaceActivity> = {
    $setOnInsert: {
      owner: owner.toLowerCase(),
      day,
      firstSeenAt: now,
      expiresAt: new Date(now.getTime() + 90 * DAY),
    },
    $max: { lastSeenAt: now },
    $inc: { requests: 1 },
  };
  const collection = db.collection<WorkspaceActivity>('workspaceActivity');
  try {
    await collection.updateOne({ _id: key }, update, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
    await collection.updateOne({ _id: key }, update);
  }
  await db
    .collection<{ _id: string; startedAt: Date }>('appMetrics')
    .updateOne(
      { _id: 'workspace-activity' },
      { $min: { startedAt: now } },
      { upsert: true },
    );
}
function amount(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,78}$/.test(value))
    throw new Error('Invalid indexed amount.');
  const n = BigInt(value);
  if (n > (1n << 256n) - 1n) throw new Error('Invalid indexed amount.');
  return n;
}
async function payments(db: Db, now: Date) {
  const { state, available } = await reconciliationState(db, now);
  const base = {
    available: false,
    partial: false,
    loaded: 0,
    sourceBlock: state?.block ?? null,
    checkedAt: state?.checkedAt?.toISOString() ?? null,
    fundedBaseUnits: null as string | null,
    claimedBaseUnits: null as string | null,
    refundedBaseUnits: null as string | null,
    committedBaseUnits: null as string | null,
  };
  if (
    !available ||
    !state?.generation ||
    !state.checkedAt ||
    !/^\d+$/.test(state.block ?? '') ||
    !/^0x[0-9a-fA-F]{64}$/.test(state.hash ?? '') ||
    state.checkedAt.getTime() > now.getTime() + 30_000
  )
    return base;
  const records = await db
    .collection<IndexedSchedule>('paymentSchedules')
    .find(
      { generation: state.generation },
      {
        projection: {
          total: 1,
          claimed: 1,
          cancelled: 1,
          vestedAtCancellation: 1,
        },
      },
    )
    .limit(5001)
    .maxTimeMS(5000)
    .toArray();
  let funded = 0n,
    claimed = 0n,
    refunded = 0n,
    committed = 0n;
  try {
    for (const record of records.slice(0, 5000)) {
      const total = amount(record.total),
        paid = amount(record.claimed);
      const cap = record.cancelled
        ? amount(record.vestedAtCancellation)
        : total;
      if (cap > total || paid > cap || typeof record.cancelled !== 'boolean')
        return base;
      funded += total;
      claimed += paid;
      refunded += total - cap;
      committed += cap - paid;
    }
  } catch {
    return base;
  }
  const current = await db
    .collection<IndexState>('paymentIndex')
    .findOne({ _id: indexKey });
  if (
    current?.generation !== state.generation ||
    current?.hash !== state.hash ||
    !current.ready ||
    current.error
  )
    return base;
  return {
    ...base,
    available: true,
    partial: records.length > 5000,
    loaded: Math.min(records.length, 5000),
    fundedBaseUnits: funded.toString(),
    claimedBaseUnits: claimed.toString(),
    refundedBaseUnits: refunded.toString(),
    committedBaseUnits: committed.toString(),
  };
}
export async function adminOverview(db: Db, now: Date, days: number) {
  const pingStarted = performance.now();
  await db.command({ ping: 1 });
  const databasePingMs = Math.round(performance.now() - pingStarted);
  const operations = await requestMetrics(db, now);
  const today = now.toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`).getTime() - (days - 1) * DAY;
  const firstDay = new Date(start).toISOString().slice(0, 10);
  const activity = db.collection<WorkspaceActivity>('workspaceActivity');
  const [
    workspaces,
    contractors,
    invoices,
    linkedDirectInvoices,
    teamMembers,
    payrollRuns,
    recurringPlans,
    paymentRequests,
    settledPaymentRequests,
    owners,
    active,
    series,
    tracking,
    payment,
    funnel,
    assistant,
    starts,
    adminAccess,
    indexState,
  ] = await Promise.all([
    db.collection('workspaces').countDocuments(),
    db.collection('contractors').countDocuments(),
    db.collection('invoices').countDocuments(),
    db.collection('invoices').countDocuments({
      paymentType: 'one-time',
      transactionHash: { $exists: true },
    }),
    db.collection('workspaceMembers').countDocuments({ status: 'active' }),
    db.collection('payrollRuns').countDocuments(),
    db.collection('recurringPlans').countDocuments({ paused: { $ne: true } }),
    db.collection('paymentRequests').countDocuments(),
    db
      .collection('paymentRequests')
      .countDocuments({ transactionHash: { $exists: true } }),
    db
      .collection('workspaces')
      .aggregate<{ count: number }>([
        { $group: { _id: '$owner' } },
        { $count: 'count' },
      ])
      .toArray(),
    activity
      .aggregate<{ count: number; returning: number }>([
        { $match: { day: { $gte: firstDay, $lte: today } } },
        { $group: { _id: '$owner', days: { $sum: 1 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            returning: { $sum: { $cond: [{ $gte: ['$days', 2] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    activity
      .aggregate<{ _id: string; wallets: number; requests: number }>([
        { $match: { day: { $gte: firstDay, $lte: today } } },
        {
          $group: {
            _id: '$day',
            wallets: { $sum: 1 },
            requests: { $sum: '$requests' },
          },
        },
      ])
      .toArray(),
    db
      .collection<{ _id: string; startedAt: Date }>('appMetrics')
      .findOne({ _id: 'workspace-activity' }),
    payments(db, now),
    invoiceFunnel(db),
    assistantSummary(db, firstDay, today),
    serviceStarts(db, now, new Date(start)),
    recentAdminAccess(db),
    db.collection<IndexState>('paymentIndex').findOne({ _id: indexKey }),
  ]);
  const reconciliationAgeSeconds = payment.checkedAt
    ? Math.max(
        0,
        Math.floor((now.getTime() - Date.parse(payment.checkedAt)) / 1000),
      )
    : null;
  const headBlock = /^\d+$/.test(indexState?.head ?? '')
    ? BigInt(indexState!.head!)
    : null;
  const indexedBlock = /^\d+$/.test(indexState?.block ?? '')
    ? BigInt(indexState!.block!)
    : null;
  const indexer = {
    configured: Boolean(indexState),
    ready: Boolean(indexState?.ready),
    error: indexState?.error ?? null,
    indexedBlock: indexedBlock?.toString() ?? null,
    headBlock: headBlock?.toString() ?? null,
    lagBlocks:
      headBlock !== null && indexedBlock !== null && headBlock >= indexedBlock
        ? Number(headBlock - indexedBlock)
        : null,
    confirmations: 12,
    checkedAt: indexState?.checkedAt?.toISOString() ?? null,
  };
  const alerts: AdminAlert[] = [];
  if (!indexState)
    alerts.push({
      level: 'warning',
      code: 'indexer-missing',
      message:
        'The payment indexer has never run here. Set PAYMENT_INDEXER_ENABLED=true on the API host.',
    });
  else if (!payment.available)
    alerts.push({
      level: 'critical',
      code: 'indexer-stale',
      message: indexState.error
        ? `Payment reconciliation is unavailable: ${indexState.error}`
        : 'Payment reconciliation is stale. Schedule links and pay-link evidence are paused until it catches up.',
    });
  if (indexer.lagBlocks !== null && indexer.lagBlocks > 100)
    alerts.push({
      level: 'warning',
      code: 'indexer-lag',
      message: `The indexer is ${indexer.lagBlocks.toLocaleString()} blocks behind the chain head.`,
    });
  if (operations && operations.requests >= 20) {
    const rate = operations.serverErrors / operations.requests;
    if (rate > 0.05)
      alerts.push({
        level: 'critical',
        code: 'error-rate',
        message: `${(rate * 100).toFixed(1)}% of API requests failed with server errors in the last 24 hours.`,
      });
  }
  if (
    operations &&
    operations.serverErrors > 0 &&
    !alerts.some((a) => a.code === 'error-rate')
  )
    alerts.push({
      level: 'warning',
      code: 'server-errors',
      message: `${operations.serverErrors} server error${operations.serverErrors === 1 ? '' : 's'} in the last 24 hours.`,
    });
  if (
    operations?.p95UpperBoundMs === null ||
    (operations?.p95UpperBoundMs ?? 0) > 5000
  )
    if (operations && operations.requests > 0)
      alerts.push({
        level: 'warning',
        code: 'latency',
        message:
          'p95 API latency is above 5 seconds. Cold starts or slow MongoDB queries are likely.',
      });
  if (starts.last24Hours > 3)
    alerts.push({
      level: 'info',
      code: 'cold-starts',
      message: `The backend started ${starts.last24Hours} times in 24 hours. Keep-alive pings may be missing; check the keep-alive workflow and external monitor.`,
    });
  if (assistant.failed > 0)
    alerts.push({
      level: 'warning',
      code: 'assistant-failures',
      message: `${assistant.failed} assistant request${assistant.failed === 1 ? '' : 's'} failed in this period.`,
    });
  if (assistant.questions >= 10 && (assistant.rates.unsupported ?? 0) > 0.25)
    alerts.push({
      level: 'info',
      code: 'assistant-gaps',
      message: `${Math.round((assistant.rates.unsupported ?? 0) * 100)}% of assistant questions were not covered by the knowledge base. Check the knowledge gaps table.`,
    });
  const byDay = new Map(series.map((row) => [row._id, row]));
  const trackedDay = tracking?.startedAt?.toISOString().slice(0, 10);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * DAY).toISOString().slice(0, 10);
    const observed = Boolean(trackedDay && date >= trackedDay);
    return {
      date,
      wallets: observed ? (byDay.get(date)?.wallets ?? 0) : null,
      requests: observed ? (byDay.get(date)?.requests ?? 0) : null,
    };
  });
  return {
    generatedAt: now.toISOString(),
    environment: 'testnet' as const,
    range: { days, from: firstDay, to: today },
    usage: {
      workspaces,
      ownerWallets: owners[0]?.count ?? 0,
      contractors,
      invoices,
      linkedDirectInvoices,
      teamMembers,
      payrollRuns,
      recurringPlans,
      paymentRequests,
      settledPaymentRequests,
      activeWallets: tracking ? (active[0]?.count ?? 0) : null,
      returningWallets: tracking ? (active[0]?.returning ?? 0) : null,
      trackingSince: tracking?.startedAt?.toISOString() ?? null,
      daily,
    },
    funnel,
    assistant,
    alerts,
    revenue: {
      status: 'not_collecting_fees' as const,
      currency: 'MUSD' as const,
      grossBaseUnits: null,
      refundBaseUnits: null,
      netBaseUnits: null,
      note: 'Runway fee collection is waived on Mezo Testnet. Customer payments and borrowed MUSD are not Runway revenue.',
      pricingModel: estimateWorkspaceRevenueEquivalent({
        workspaces,
        fundedBaseUnits:
          payment.fundedBaseUnits !== null
            ? BigInt(payment.fundedBaseUnits)
            : null,
      }),
    },
    payments: payment,
    health: {
      database: 'connected' as const,
      databasePingMs,
      indexer,
      starts,
      adminAccess,
      reconciliation: payment.available
        ? ('current' as const)
        : ('unavailable' as const),
      requestErrorCount: operations?.serverErrors ?? null,
      requests: operations,
      reconciliationAgeSeconds,
      operatingCost: operatingCostRecord(undefined, now),
    },
  };
}
