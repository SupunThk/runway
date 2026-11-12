import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { zeroHash, type Hash } from 'viem';
import { createApp } from './app.ts';
import { initializeDatabase } from './db.ts';
import { paymentDeployment } from './reconciliation.ts';
import { backfillSettlements, reserveSettlement } from './settlements.ts';
import type { TransferEvidence } from './direct-payments.ts';

const origin = 'http://127.0.0.1:5300',
  owner = privateKeyToAccount(generatePrivateKey()),
  payer = privateKeyToAccount(generatePrivateKey());
const hash = `0x${'ab'.repeat(32)}` as Hash;
let mongo: MongoMemoryServer,
  client: MongoClient,
  db: Db,
  app: ReturnType<typeof createApp>,
  instant: Date,
  evidence: TransferEvidence;
const call = (
  path: string,
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) =>
  app.request('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: requestOrigin,
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
async function setup() {
  const cookie = await login();
  const workspace = await (
    await call('/workspaces', { name: 'PRIVATE WORKSPACE' }, cookie)
  ).json();
  const body = {
    recipient: payer.address,
    amount: '1.000000000000000001',
    publicBusinessName: 'Public studio',
    publicMemo: 'Public project',
    privateNote: 'PRIVATE NOTE',
    clientLabel: 'PRIVATE LABEL',
    expiresAt: new Date(instant.getTime() + 86400000).toISOString(),
  };
  const path = `/workspaces/${workspace._id}`;
  const response = await call(path + '/payment-requests', body, cookie);
  expect(response.status).toBe(201);
  return { cookie, workspace, body, path, row: await response.json() };
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db('payment_request_tests');
  await initializeDatabase(db);
}, 120000);
beforeEach(async () => {
  for (const collection of await db.collections())
    await collection.deleteMany({});
  instant = new Date('2026-11-03T12:00:00Z');
  evidence = {
    status: 'paid',
    verified: true,
    payer: payer.address.toLowerCase(),
    blockNumber: '123',
    blockHash: zeroHash,
    timestamp: instant.toISOString(),
    confirmations: '12',
  };
  app = createApp({
    getDb: async () => db,
    origin,
    now: () => instant,
    verifyDirectPayment: async () => 'paid',
    verifyPaymentRequest: async () => evidence,
  });
});
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});
describe('client payment request boundaries', () => {
  it('protects owner records and whitelists bearer-link fields', async () => {
    const s = await setup(),
      other = await login(payer);
    expect((await call(s.path + '/payment-requests')).status).toBe(401);
    expect(
      (await call(s.path + '/payment-requests', undefined, other)).status,
    ).toBe(404);
    const response = await call('/pay/' + s.row.token);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const publicRow = await response.json();
    expect(Object.keys(publicRow).sort()).toEqual(
      [
        'recipient',
        'amountBaseUnits',
        'publicBusinessName',
        'publicMemo',
        'createdAt',
        'expiresAt',
        'transactionHash',
        'status',
        'receipt',
        'checkedAt',
        'chainId',
        'tokenAddress',
      ].sort(),
    );
    expect(JSON.stringify(publicRow)).not.toMatch(
      /PRIVATE|workspaceId|privateNote|clientLabel|session/,
    );
    expect(publicRow.amountBaseUnits).toBe('1000000000000000001');
    expect((await call('/pay/not-a-token')).status).toBe(404);
    expect((await call('/pay/' + 'x'.repeat(43))).status).toBe(404);
    expect(
      (
        await call(
          '/pay/' + s.row.token + '/payment',
          { transactionHash: hash },
          undefined,
          'https://wrong.example',
        )
      ).status,
    ).toBe(403);
  });
  it('settles idempotently, derives a fresh receipt and rejects a second hash', async () => {
    const { row } = await setup(),
      path = '/pay/' + row.token;
    expect(
      (await call(path + '/payment', { transactionHash: hash })).status,
    ).toBe(200);
    expect(
      (await call(path + '/payment', { transactionHash: hash })).status,
    ).toBe(200);
    const result = await (await call(path)).json();
    expect(result.status).toBe('paid');
    expect(result.receipt.payer).toBe(payer.address.toLowerCase());
    expect(result.receipt.blockNumber).toBe('123');
    expect(
      (await call(path + '/payment', { transactionHash: zeroHash })).status,
    ).toBe(409);
    expect(await db.collection('settlementClaims').countDocuments()).toBe(1);
    evidence = { status: 'unavailable', verified: false };
    const unavailable = await (await call(path)).json();
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.transactionHash).toBe(hash);
    expect(unavailable.receipt).toBeNull();
  });
  it('allows exactly one concurrent claim across an invoice and a client request', async () => {
    const s = await setup();
    const contractor = await (
      await call(
        s.path + '/contractors',
        { name: 'Contractor', address: payer.address },
        s.cookie,
      )
    ).json();
    const invoice = await (
      await call(
        s.path + '/invoices',
        {
          contractorId: contractor._id,
          description: 'Work',
          amount: s.body.amount,
          dueDate: '2026-11-10',
          paymentType: 'one-time',
        },
        s.cookie,
      )
    ).json();
    const results = await Promise.all([
      call(`/pay/${s.row.token}/payment`, { transactionHash: hash }),
      call(
        `${s.path}/invoices/${invoice._id}/payment`,
        { transactionHash: hash },
        s.cookie,
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.collection('settlementClaims').countDocuments()).toBe(1);
    const linkedRequests = await db
      .collection('paymentRequests')
      .countDocuments({ transactionHash: hash });
    const linkedInvoices = await db
      .collection('invoices')
      .countDocuments({ transactionHash: hash });
    expect(linkedRequests + linkedInvoices).toBe(1);
  });
  it('prevents concurrent requests from reusing one transfer and fences cancellation', async () => {
    const s = await setup();
    const second = await (
      await call(s.path + '/payment-requests', s.body, s.cookie)
    ).json();
    const results = await Promise.all([
      call(`/pay/${s.row.token}/payment`, { transactionHash: hash }),
      call(`/pay/${second.token}/payment`, { transactionHash: hash }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const third = await (
      await call(s.path + '/payment-requests', s.body, s.cookie)
    ).json();
    const race = await Promise.all([
      call(`${s.path}/payment-requests/${third._id}/cancel`, {}, s.cookie),
      call(`/pay/${third.token}/payment`, { transactionHash: zeroHash }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await db
      .collection('paymentRequests')
      .findOne({ _id: third._id });
    expect(
      Boolean(stored?.cancelledAt) && Boolean(stored?.transactionHash),
    ).toBe(false);
  });
  it('does not reserve invalid, unavailable or unmined hashes, and accepts a qualifying transfer across expiry', async () => {
    const { row } = await setup(),
      path = `/pay/${row.token}/payment`;
    for (const [status, expected] of [
      ['invalid', 409],
      ['unavailable', 503],
      ['awaiting_confirmation', 202],
    ] as const) {
      evidence = { status, verified: false };
      expect((await call(path, { transactionHash: hash })).status).toBe(
        expected,
      );
      expect(await db.collection('settlementClaims').countDocuments()).toBe(0);
      expect(
        (await db.collection('paymentRequests').findOne({ _id: row._id }))
          ?.transactionHash,
      ).toBeUndefined();
    }
    instant = new Date(instant.getTime() + 2 * 86400000);
    expect((await (await call(`/pay/${row.token}`)).json()).status).toBe(
      'expired',
    );
    expect((await call(path, { transactionHash: hash })).status).toBe(409);
    evidence = {
      status: 'paid',
      verified: true,
      payer: payer.address,
      timestamp: row.createdAt,
      confirmations: '12',
      blockNumber: '123',
      blockHash: zeroHash,
    };
    expect((await call(path, { transactionHash: hash })).status).toBe(200);
    expect((await (await call(`/pay/${row.token}`)).json()).status).toBe(
      'paid',
    );
  });
  it('finishes a same-target reservation after an interrupted document update', async () => {
    const s = await setup(),
      key = `${paymentDeployment.chainId}:${paymentDeployment.token}:${hash}`;
    await db
      .collection('paymentRequests')
      .updateOne({ _id: s.row._id }, { $set: { linkingHash: hash } });
    await reserveSettlement(
      db,
      key,
      {
        targetType: 'payment-request',
        targetId: s.row._id,
        workspaceId: s.workspace._id,
      },
      instant,
    );
    expect((await (await call(`/pay/${s.row.token}`)).json()).status).toBe(
      'verification_pending',
    );
    expect(
      (await call(`/pay/${s.row.token}/payment`, { transactionHash: hash }))
        .status,
    ).toBe(200);
    expect((await (await call(`/pay/${s.row.token}`)).json()).status).toBe(
      'paid',
    );
    expect(await db.collection('settlementClaims').countDocuments()).toBe(1);
  });
  it('fences historical invoice keys and backfills without overwriting conflicts', async () => {
    const s = await setup(),
      key = `${paymentDeployment.chainId}:${paymentDeployment.token}:${hash}`;
    await db
      .collection<{ _id: string; workspaceId: string; paymentKey: string }>(
        'invoices',
      )
      .insertOne({
        _id: crypto.randomUUID(),
        workspaceId: s.workspace._id,
        paymentKey: key,
      });
    expect(
      (await call(`/pay/${s.row.token}/payment`, { transactionHash: hash }))
        .status,
    ).toBe(409);
    await backfillSettlements(db);
    expect(await db.collection('settlementClaims').countDocuments()).toBe(1);
    await reserveSettlement(
      db,
      key + ':conflict',
      {
        targetType: 'payment-request',
        targetId: s.row._id,
        workspaceId: s.workspace._id,
      },
      instant,
    );
    await db
      .collection<{ _id: string; workspaceId: string; paymentKey: string }>(
        'invoices',
      )
      .insertOne({
        _id: crypto.randomUUID(),
        workspaceId: s.workspace._id,
        paymentKey: key + ':conflict',
      });
    await expect(backfillSettlements(db)).rejects.toThrow('already linked');
  });
});
