import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createApp } from './app.ts';
import { initializeDatabase } from './db.ts';

const origin = 'http://127.0.0.1:5173';
const owner = privateKeyToAccount(generatePrivateKey());
const outsider = privateKeyToAccount(generatePrivateKey());
let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let instant: Date;
let app: ReturnType<typeof createApp>;
const call = (
  path: string,
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) =>
  app.request(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: requestOrigin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function challenge(account = owner) {
  const response = await call('/auth/challenge', { address: account.address });
  expect(response.status).toBe(200);
  const data = await response.json();
  return {
    nonce: data.nonce,
    signature: await account.signMessage({ message: data.message }),
    message: data.message,
  };
}
async function login(account = owner) {
  const proof = await challenge(account);
  const response = await call('/auth/verify', {
    nonce: proof.nonce,
    signature: proof.signature,
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
async function workspace(cookie: string) {
  const response = await call('/workspaces', { name: 'Studio' }, cookie);
  expect(response.status).toBe(201);
  return (await response.json())._id as string;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db('runway_tests');
  await initializeDatabase(db);
}, 600000);
beforeEach(async () => {
  for (const name of [
    'challenges',
    'sessions',
    'rateLimits',
    'workspaces',
    'contractors',
    'invoices',
  ])
    await db.collection(name).deleteMany({});
  instant = new Date('2026-10-13T12:00:00Z');
  app = createApp({ getDb: async () => db, origin, now: () => instant });
});
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});

describe('MongoDB API integration', () => {
  it('signs in with a domain-bound message, stores only a token hash and revokes logout', async () => {
    const proof = await challenge();
    expect(proof.message).toContain('127.0.0.1:5173 wants you to sign in');
    expect(proof.message).toContain('Chain ID: 31611');
    const response = await call('/auth/verify', proof);
    const header = response.headers.get('set-cookie')!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    const cookie = header.split(';')[0];
    const stored = await db.collection('sessions').findOne({});
    expect(stored!._id).not.toBe(cookie.split('=')[1]);
    expect((await call('/auth/session', undefined, cookie)).status).toBe(200);
    expect((await call('/auth/logout', {}, cookie)).status).toBe(200);
    expect((await call('/auth/session', undefined, cookie)).status).toBe(401);
  });
  it('rejects incorrect signatures and atomically prevents concurrent nonce replay', async () => {
    const proof = await challenge();
    const bad = await outsider.signMessage({ message: proof.message });
    expect(
      (await call('/auth/verify', { nonce: proof.nonce, signature: bad }))
        .status,
    ).toBe(401);
    const responses = await Promise.all([
      call('/auth/verify', proof),
      call('/auth/verify', proof),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await db.collection('sessions').countDocuments()).toBe(1);
  });
  it('enforces expiration without waiting for MongoDB TTL cleanup', async () => {
    const proof = await challenge();
    instant = new Date(instant.getTime() + 300001);
    expect((await call('/auth/verify', proof)).status).toBe(401);
    const cookie = await login();
    instant = new Date(instant.getTime() + 86400001);
    expect((await call('/auth/session', undefined, cookie)).status).toBe(401);
  });
  it('rejects cross-origin mutations, unauthenticated reads and oversized bodies', async () => {
    expect(
      (
        await call(
          '/auth/challenge',
          { address: owner.address },
          undefined,
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
    expect((await call('/workspaces')).status).toBe(401);
    expect(
      (await call('/auth/challenge', { padding: 'x'.repeat(20000) })).status,
    ).toBe(413);
  });
  it('isolates workspaces and prevents cross-workspace contractor references', async () => {
    const a = await login();
    const b = await login(outsider);
    const workspaceId = await workspace(a);
    const foreignId = await workspace(b);
    expect(
      (await (await call('/workspaces', undefined, b)).json()).items.map(
        (w: { _id: string }) => w._id,
      ),
    ).toEqual([foreignId]);
    expect(
      (await call(`/workspaces/${workspaceId}/contractors`, undefined, b))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/contractors`,
          { name: 'Intruder', address: outsider.address },
          b,
        )
      ).status,
    ).toBe(404);
    const contractor = await (
      await call(
        `/workspaces/${workspaceId}/contractors`,
        { name: 'Alex', address: outsider.address },
        a,
      )
    ).json();
    expect(
      (
        await call(
          `/workspaces/${foreignId}/invoices`,
          {
            contractorId: contractor._id,
            description: 'Foreign',
            amount: '1',
            dueDate: '2026-11-01',
          },
          b,
        )
      ).status,
    ).toBe(404);
  });
  it('saves exact invoice amounts, rejects invalid inputs and deduplicates contractor wallets', async () => {
    const cookie = await login();
    const workspaceId = await workspace(cookie);
    const path = `/workspaces/${workspaceId}`;
    const contractor = await (
      await call(
        `${path}/contractors`,
        { name: 'Alex', address: outsider.address },
        cookie,
      )
    ).json();
    expect(
      (
        await call(
          `${path}/contractors`,
          { name: 'Duplicate', address: outsider.address.toLowerCase() },
          cookie,
        )
      ).status,
    ).toBe(409);
    const body = {
      contractorId: contractor._id,
      description: 'Design',
      amount: '1000.123456789012345678',
      dueDate: '2026-11-01',
      status: 'paid',
    };
    const invoice = await call(`${path}/invoices`, body, cookie);
    expect(invoice.status).toBe(201);
    expect(await invoice.json()).toMatchObject({
      amount: body.amount,
      amountBaseUnits: '1000123456789012345678',
      status: 'draft',
      recipient: outsider.address.toLowerCase(),
    });
    for (const amount of ['0', '-1', '1e3', '1.1234567890123456789'])
      expect(
        (await call(`${path}/invoices`, { ...body, amount }, cookie)).status,
      ).toBe(400);
    expect(
      (
        await call(
          `${path}/invoices`,
          { ...body, dueDate: '2026-02-30' },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          `${path}/contractors`,
          { name: { $ne: null }, address: outsider.address },
          cookie,
        )
      ).status,
    ).toBe(400);
    const rows = await (
      await call(`${path}/invoices`, undefined, cookie)
    ).json();
    expect(rows.items).toHaveLength(1);
  });
  it('paginates records without omissions or duplicates', async () => {
    const cookie = await login();
    for (let i = 0; i < 27; i++)
      expect(
        (await call('/workspaces', { name: `Workspace ${i}` }, cookie)).status,
      ).toBe(201);
    const first = await (await call('/workspaces', undefined, cookie)).json();
    const second = await (
      await call(`/workspaces?after=${first.nextCursor}`, undefined, cookie)
    ).json();
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.items, ...second.items].map((w: { _id: string }) => w._id),
      ).size,
    ).toBe(27);
    expect(
      (await call('/workspaces?after=bad', undefined, cookie)).status,
    ).toBe(400);
  });
  it('rate limits login challenges using shared database counters', async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await call('/auth/challenge', { address: owner.address })).status,
      ).toBe(200);
    expect(
      (await call('/auth/challenge', { address: owner.address })).status,
    ).toBe(429);
    instant = new Date(instant.getTime() + 60000);
    expect(
      (await call('/auth/challenge', { address: owner.address })).status,
    ).toBe(200);
  });
  it('reports readiness and sanitizes unavailable database errors', async () => {
    expect((await call('/health')).status).toBe(200);
    app = createApp({
      origin,
      getDb: async () => {
        throw new Error('mongodb://private:secret@internal');
      },
    });
    for (const path of ['/health', '/workspaces']) {
      const response = await call(path);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('secret');
    }
  });
});
