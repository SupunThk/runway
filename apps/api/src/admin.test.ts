import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createApp } from './app.ts';
import { initializeDatabase } from './db.ts';
import { parseAdminWallets } from './admin.ts';
import { recordWorkspaceActivity } from './admin-metrics.ts';
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
    expect(data.usage.activeWallets).toBeNull();
    expect(data.usage.daily.every((d: any) => d.wallets === null)).toBe(true);
    expect(data.revenue.netBaseUnits).toBeNull();
    expect(data.revenue.status).toBe('not_collecting_fees');
    expect(data.revenue.pricingModel.scheduleFeeBps).toBe(25);
    expect(
      data.revenue.pricingModel.monthlySubscriptionEquivalentBaseUnits,
    ).toBe((49n * 10n ** 18n).toString());
    expect(data.revenue.pricingModel.scheduleFeeBps).toBe(25);
    expect(data.revenue.pricingModel.monthlySubscriptionEquivalentBaseUnits).toBe(
      (49n * 10n ** 18n).toString(),
    );
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
