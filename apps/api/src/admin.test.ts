import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createApp } from './app.ts';
import { initializeDatabase } from './db.ts';
import { parseAdminWallets } from './admin.ts';
import { recordWorkspaceActivity } from './admin-metrics.ts';
import { recordAssistantMetric } from './admin-insights.ts';
import {
  indexKey,
  type IndexState,
  type IndexedSchedule,
} from './reconciliation.ts';

const owner = privateKeyToAccount(generatePrivateKey());
const outsider = privateKeyToAccount(generatePrivateKey());
const origin = 'http://127.0.0.1:5300';
let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let app: ReturnType<typeof createApp>;
let instant: Date;
let allowed: string[];
const call = (path: string, body?: unknown, cookie?: string, from = origin) =>
  app.request(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: from,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function login(account = owner) {
  const challenge = await (
    await call('/auth/challenge', { address: account.address })
  ).json();
  const response = await call('/auth/verify', {
    nonce: challenge.nonce,
    signature: await account.signMessage({ message: challenge.message }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db('runway_admin_tests');
  await initializeDatabase(db);
}, 600000);
beforeEach(async () => {
  for (const collection of await db.listCollections().toArray())
    await db.collection(collection.name).deleteMany({});
  instant = new Date('2026-11-01T12:00:00Z');
  allowed = [owner.address];
  app = createApp({
    getDb: async () => db,
    origin,
    now: () => instant,
    adminWallets: allowed,
  });
});
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});
describe('admin authorization and truthful aggregate metrics', () => {
  it('denies anonymous, non-admin and forged address headers on every admin endpoint', async () => {
    expect((await call('/admin/overview')).status).toBe(401);
    const cookie = await login(outsider);
    expect((await call('/admin/session', undefined, cookie)).status).toBe(403);
    expect((await call('/admin/overview', undefined, cookie)).status).toBe(403);
    const forged = await app.request('/api/admin/overview', {
      headers: { cookie, 'x-admin-wallet': owner.address },
    });
    expect(forged.status).toBe(403);
    expect(JSON.stringify(await forged.json())).not.toContain('workspaces');
  });
  it('defaults to no admins, fails closed for malformed configuration and never accepts the zero address', async () => {
    expect(parseAdminWallets(undefined).size).toBe(0);
    expect(parseAdminWallets(`${owner.address},bad`).size).toBe(0);
    expect(
      parseAdminWallets('0x0000000000000000000000000000000000000000').size,
    ).toBe(0);
    expect(
      parseAdminWallets(owner.address.toUpperCase().replace('0X', '0x')).has(
        owner.address.toLowerCase(),
      ),
    ).toBe(true);
    allowed.length = 0;
    expect(
      (await call('/admin/session', undefined, await login())).status,
    ).toBe(403);
  });
  it('rechecks the allowlist and revocable session for an already logged-in admin', async () => {
    const cookie = await login();
    expect((await call('/admin/session', undefined, cookie)).status).toBe(200);
    allowed.length = 0;
    expect((await call('/admin/overview', undefined, cookie)).status).toBe(403);
    allowed.push(owner.address);
    expect((await call('/auth/logout', {}, cookie)).status).toBe(200);
    expect((await call('/admin/overview', undefined, cookie)).status).toBe(401);
  });
  it('returns aggregates without private names, descriptions, addresses, session tokens or fabricated revenue', async () => {
    await db.collection('workspaces').insertOne({
      name: 'PRIVATE STUDIO',
      owner: owner.address.toLowerCase(),
    });
    await db
      .collection('contractors')
      .insertOne({ name: 'PRIVATE PERSON', address: outsider.address });
    await db.collection('invoices').insertOne({
      description: 'PRIVATE INVOICE',
      amountBaseUnits: '99999999999999999999999',
      paymentType: 'one-time',
      transactionHash: '0xhidden',
    });
    const cookie = await login();
    const response = await call('/admin/overview', undefined, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data.usage.workspaces).toBe(1);
    expect(data.usage.ownerWallets).toBe(1);
    expect(data.usage.contractors).toBe(1);
    expect(data.usage.linkedDirectInvoices).toBe(1);
    expect(data.usage.teamMembers).toBe(0);
    expect(data.usage.payrollRuns).toBe(0);
    expect(data.usage.recurringPlans).toBe(0);
    expect(data.usage.paymentRequests).toBe(0);
    expect(data.usage.settledPaymentRequests).toBe(0);
    expect(data.usage.activeWallets).toBeNull();
    expect(data.usage.daily.every((d: any) => d.wallets === null)).toBe(true);
    expect(data.revenue.netBaseUnits).toBeNull();
    expect(data.revenue.status).toBe('not_collecting_fees');
    expect(data.revenue.pricingModel.scheduleFeeBps).toBe(25);
    expect(
      data.revenue.pricingModel.monthlySubscriptionEquivalentBaseUnits,
    ).toBe((49n * 10n ** 18n).toString());
    expect(data.revenue.pricingModel.scheduleFeeBps).toBe(25);
    expect(
      data.revenue.pricingModel.monthlySubscriptionEquivalentBaseUnits,
    ).toBe((49n * 10n ** 18n).toString());
    expect(data.payments.fundedBaseUnits).toBeNull();
    const serialized = JSON.stringify(data);
    for (const secret of [
      'PRIVATE STUDIO',
      'PRIVATE PERSON',
      'PRIVATE INVOICE',
      owner.address.toLowerCase(),
      outsider.address,
      '0xhidden',
      cookie.split('=')[1],
    ])
      expect(serialized).not.toContain(secret);
  });
  it('tracks successful workspace use once per wallet/day and counts returning wallets without counting admin refreshes', async () => {
    const cookie = await login();
    await call('/workspaces', undefined, cookie);
    await call('/workspaces', { name: 'Test' }, cookie);
    await call('/admin/overview', undefined, cookie);
    expect(await db.collection('workspaceActivity').countDocuments()).toBe(1);
    instant = new Date('2026-11-02T12:00:00Z');
    await call('/workspaces', undefined, cookie);
    // Renew the one-day session before recording the second activity day.
    const renewed = await login();
    await call('/workspaces', undefined, renewed);
    const data = await (
      await call('/admin/overview?days=7', undefined, renewed)
    ).json();
    expect(data.usage.activeWallets).toBe(1);
    expect(data.usage.returningWallets).toBe(1);
    expect(
      data.usage.daily.find((d: any) => d.date === '2026-11-01').requests,
    ).toBe(2);
    expect(
      data.usage.daily.find((d: any) => d.date === '2026-10-31').wallets,
    ).toBeNull();
    expect(
      data.usage.daily.find((d: any) => d.date === '2026-11-02').wallets,
    ).toBe(1);
  });
  it('rejects failed/unauthenticated workspace attempts as activity and retains exact integer payment accounting', async () => {
    await call('/workspaces');
    const cookie = await login();
    await call('/workspaces', { name: '' }, cookie);
    expect(await db.collection('workspaceActivity').countDocuments()).toBe(0);
    await db.collection<IndexState>('paymentIndex').insertOne({
      _id: indexKey,
      generation: 'g',
      ready: true,
      checkedAt: instant,
      block: '123',
      hash: `0x${'11'.repeat(32)}`,
    });
    const U = 10n ** 18n;
    const row = {
      generation: 'g',
      sender: owner.address,
      recipient: outsider.address,
      referenceHash: '0x0',
      expiresAt: new Date(instant.getTime() + 60000),
    };
    await db.collection<IndexedSchedule>('paymentSchedules').insertMany([
      {
        ...row,
        _id: 'a',
        scheduleId: '1',
        total: (100n * U + 1n).toString(),
        claimed: (25n * U).toString(),
        cancelled: false,
        vestedAtCancellation: '0',
      },
      {
        ...row,
        _id: 'b',
        scheduleId: '2',
        total: (100n * U).toString(),
        claimed: (15n * U).toString(),
        cancelled: true,
        vestedAtCancellation: (40n * U).toString(),
      },
      {
        ...row,
        _id: 'orphan',
        generation: 'old',
        scheduleId: '3',
        total: (999n * U).toString(),
        claimed: '0',
        cancelled: false,
        vestedAtCancellation: '0',
      },
    ]);
    const data = await (
      await call('/admin/overview', undefined, cookie)
    ).json();
    expect(data.payments.fundedBaseUnits).toBe((200n * U + 1n).toString());
    expect(data.payments.claimedBaseUnits).toBe((40n * U).toString());
    expect(data.payments.refundedBaseUnits).toBe((60n * U).toString());
    expect(data.payments.committedBaseUnits).toBe((100n * U + 1n).toString());
    instant = new Date(instant.getTime() + 121000);
    const stale = await (
      await call('/admin/overview', undefined, cookie)
    ).json();
    expect(stale.payments.available).toBe(false);
    expect(stale.payments.claimedBaseUnits).toBeNull();
  });
  it('bounds report ranges and admin read volume', async () => {
    const cookie = await login();
    expect(
      (await call('/admin/overview?days=365', undefined, cookie)).status,
    ).toBe(400);
    for (let i = 0; i < 29; i++)
      expect((await call('/admin/session', undefined, cookie)).status).toBe(
        200,
      );
    expect((await call('/admin/overview', undefined, cookie)).status).toBe(429);
  });
  it('records analytics without touching customer documents', async () => {
    await recordWorkspaceActivity(db, owner.address, instant);
    await recordWorkspaceActivity(db, owner.address, instant);
    expect(await db.collection('workspaces').countDocuments()).toBe(0);
    const data = await (
      await call('/admin/overview', undefined, await login())
    ).json();
    expect(data.usage.activeWallets).toBe(1);
    expect(data.usage.returningWallets).toBe(0);
  });
  it('keeps concurrent activity requests in a single daily bucket', async () => {
    await Promise.all(
      Array.from({ length: 12 }, () =>
        recordWorkspaceActivity(db, owner.address, instant),
      ),
    );
    const rows = await db.collection('workspaceActivity').find().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].requests).toBe(12);
  });
  it('marks capped schedule aggregation partial rather than publishing complete totals', async () => {
    await db.collection<IndexState>('paymentIndex').insertOne({
      _id: indexKey,
      generation: 'large',
      ready: true,
      checkedAt: instant,
      block: '123',
      hash: `0x${'11'.repeat(32)}`,
    });
    await db.collection<IndexedSchedule>('paymentSchedules').insertMany(
      Array.from({ length: 5001 }, (_, i) => ({
        _id: `large-${i}`,
        generation: 'large',
        scheduleId: String(i + 1),
        sender: owner.address,
        recipient: outsider.address,
        total: '1',
        claimed: '0',
        cancelled: false,
        vestedAtCancellation: '0',
        referenceHash: '0x0',
      })),
    );
    const data = await (
      await call('/admin/overview', undefined, await login())
    ).json();
    expect(data.payments.partial).toBe(true);
    expect(data.payments.loaded).toBe(5000);
    expect(data.payments.fundedBaseUnits).toBe('5000');
  });
  it('withholds inconsistent indexed amounts rather than fabricating payment figures', async () => {
    await db.collection<IndexState>('paymentIndex').insertOne({
      _id: indexKey,
      generation: 'bad',
      ready: true,
      checkedAt: instant,
      block: '123',
      hash: `0x${'11'.repeat(32)}`,
    });
    await db.collection<IndexedSchedule>('paymentSchedules').insertOne({
      _id: 'bad',
      generation: 'bad',
      scheduleId: '1',
      sender: owner.address,
      recipient: outsider.address,
      total: '1',
      claimed: '2',
      cancelled: false,
      vestedAtCancellation: '0',
      referenceHash: '0x0',
    });
    const data = await (
      await call('/admin/overview', undefined, await login())
    ).json();
    expect(data.payments.available).toBe(false);
    expect(data.payments.fundedBaseUnits).toBeNull();
  });
});

describe('admin insights, cache and operational actions', () => {
  it('reports an aggregate invoice funnel, active team members and time to payment without private fields', async () => {
    await db.collection('workspaceMembers').insertMany([
      {
        _id: 'm1',
        workspaceId: 'w',
        address: '0x1',
        role: 'approver',
        status: 'active',
      },
      {
        _id: 'm2',
        workspaceId: 'w',
        address: '0x2',
        role: 'viewer',
        status: 'invited',
      },
    ] as never[]);
    await db.collection('invoices').insertMany([
      {
        _id: 'i1',
        workspaceId: 'w',
        description: 'SECRET A',
        createdAt: '2026-11-01T00:00:00.000Z',
        submittedBy: '0x3',
        scheduleId: '1',
      },
      {
        _id: 'i2',
        workspaceId: 'w',
        description: 'SECRET B',
        createdAt: '2026-11-01T00:00:00.000Z',
        reviewRejected: 'x',
      },
      {
        _id: 'i3',
        workspaceId: 'w',
        description: 'SECRET C',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ] as never[]);
    await db.collection('workspaceReviews').insertMany([
      { _id: 'w:invoice:i1:0', version: 0, approvals: ['0x1'] },
      { _id: 'w:invoice:i1:1', version: 1, approvals: ['0x1'] },
      { _id: 'w:payroll:r1:0', version: 0, approvals: ['0x1'] },
    ] as never[]);
    await db.collection('payrollRuns').insertOne({
      _id: 'r1',
      workspaceId: 'w',
      invoiceIds: ['i1', 'i3'],
    } as never);
    await db.collection('settlementClaims').insertOne({
      _id: 'k',
      targetType: 'invoice',
      targetId: 'i1',
      workspaceId: 'w',
      createdAt: new Date('2026-11-01T06:00:00Z'),
    } as never);
    const data = await (
      await call('/admin/overview', undefined, await login())
    ).json();
    expect(data.usage.teamMembers).toBe(1);
    expect(data.funnel).toMatchObject({
      created: 3,
      contractorSubmitted: 1,
      reviewed: 1,
      rejected: 1,
      inPayrollRun: 2,
      paymentLinked: 1,
      medianHoursToPayment: 6,
      timedSamples: 1,
    });
    expect(JSON.stringify(data)).not.toContain('SECRET');
    expect(data.health.databasePingMs).toBeGreaterThanOrEqual(0);
  });
  it('summarises assistant usage and raises alerts for stale indexing and assistant failures', async () => {
    await recordAssistantMetric(
      db,
      { kind: 'answer', sources: ['payments.claim', 'x'] },
      900,
      instant,
    );
    await recordAssistantMetric(
      db,
      { kind: 'out_of_scope', sources: [] },
      100,
      instant,
    );
    await recordAssistantMetric(db, { failed: true }, 50, instant);
    await db.collection<IndexState>('paymentIndex').insertOne({
      _id: indexKey,
      generation: 'g',
      ready: true,
      checkedAt: new Date(instant.getTime() - 600000),
      block: '100',
      head: '400',
      hash: `0x${'11'.repeat(32)}`,
    });
    const data = await (
      await call('/admin/overview', undefined, await login())
    ).json();
    expect(data.assistant).toMatchObject({
      questions: 3,
      answered: 1,
      declined: 1,
      failed: 1,
    });
    expect(data.assistant.topSources[0].id).toBe('payments-claim');
    expect(data.health.indexer).toMatchObject({
      indexedBlock: '100',
      headBlock: '400',
      lagBlocks: 300,
    });
    const codes = data.alerts.map((a: any) => a.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'indexer-stale',
        'indexer-lag',
        'assistant-failures',
      ]),
    );
  });
  it('logs admin access with shortened wallets and records backend starts', async () => {
    const cookie = await login();
    await call('/admin/session', undefined, cookie);
    const data = await (
      await call('/admin/overview', undefined, cookie)
    ).json();
    expect(data.health.adminAccess).toHaveLength(1);
    expect(data.health.adminAccess[0].requests).toBe(2);
    expect(data.health.adminAccess[0].wallet).toMatch(
      /^0x[0-9a-f]{4}…[0-9a-f]{4}$/,
    );
    expect(data.health.starts.inRange).toBe(1);
  });
  it('serves a 30 second cache unless a fresh snapshot is requested', async () => {
    const cookie = await login();
    const first = await (
      await call('/admin/overview', undefined, cookie)
    ).json();
    expect(first.cached).toBe(false);
    await db
      .collection('workspaces')
      .insertOne({ _id: 'new', owner: '0x9' } as never);
    const second = await (
      await call('/admin/overview', undefined, cookie)
    ).json();
    expect(second.cached).toBe(true);
    expect(second.usage.workspaces).toBe(first.usage.workspaces);
    const fresh = await (
      await call('/admin/overview?fresh=1', undefined, cookie)
    ).json();
    expect(fresh.usage.workspaces).toBe(first.usage.workspaces + 1);
    instant = new Date(instant.getTime() + 31000);
    expect(
      (await (await call('/admin/overview', undefined, cookie)).json()).cached,
    ).toBe(false);
  });
  it('runs the indexer only for admins, only when enabled, and throttles it', async () => {
    let runs = 0;
    app = createApp({
      getDb: async () => db,
      origin,
      now: () => instant,
      adminWallets: allowed,
      runIndexer: async () => {
        runs++;
        return true;
      },
    });
    expect(
      (await call('/admin/actions/reindex', {}, await login(outsider))).status,
    ).toBe(403);
    const cookie = await login();
    expect(
      (await (await call('/admin/session', undefined, cookie)).json()).actions
        .reindex,
    ).toBe(true);
    for (let i = 0; i < 3; i++)
      expect((await call('/admin/actions/reindex', {}, cookie)).status).toBe(
        200,
      );
    expect((await call('/admin/actions/reindex', {}, cookie)).status).toBe(429);
    expect(runs).toBe(3);
    app = createApp({
      getDb: async () => db,
      origin,
      now: () => instant,
      adminWallets: allowed,
      runIndexer: null,
    });
    expect(
      (await call('/admin/actions/reindex', {}, await login())).status,
    ).toBe(503);
    app = createApp({
      getDb: async () => db,
      origin,
      now: () => instant,
      adminWallets: allowed,
      runIndexer: async () => {
        throw new Error('rpc down');
      },
    });
    instant = new Date(instant.getTime() + 120000);
    expect(
      (await call('/admin/actions/reindex', {}, await login())).status,
    ).toBe(502);
  });
});
