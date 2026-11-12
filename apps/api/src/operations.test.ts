import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  operatingCostRecord,
  recordRequestMetric,
  requestFamily,
  requestMetrics,
} from './operations.ts';
let mongo: MongoMemoryServer, client: MongoClient, db: Db;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db('operations_tests');
}, 120000);
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});
describe('bounded operational evidence', () => {
  it('counts concurrent observed failures without private dimensions or invented history', async () => {
    const now = new Date('2026-11-03T12:05:00Z');
    expect(await requestMetrics(db, now)).toBeNull();
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        recordRequestMetric(
          db,
          requestFamily('/api/pay/PRIVATE-BEARER-TOKEN')!,
          i < 3 ? 503 : i < 5 ? 409 : 200,
          i * 100,
          now,
        ),
      ),
    );
    const result = await requestMetrics(db, now);
    expect(result).toMatchObject({
      requests: 30,
      serverErrors: 3,
      clientErrors: 2,
      observedSince: now.toISOString(),
      p95UpperBoundMs: 5000,
    });
    expect(result?.byFamily['payment-link']).toEqual({
      requests: 30,
      serverErrors: 3,
      clientErrors: 2,
      averageMs: 1450,
    });
    const raw = await db.collection('requestMetrics').find().toArray();
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw)).not.toContain('PRIVATE');
    expect(requestFamily('/api/admin/overview')).toBeUndefined();
    expect(requestFamily('/api/health')).toBeUndefined();
    expect(
      await requestMetrics(db, new Date('2026-11-05T12:00:00Z')),
    ).toBeNull();
  });
  it('accepts only explicitly actual, dated cost records and marks old periods', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    const row = {
      kind: 'actual',
      amountUsd: '7.00',
      periodStart: '2026-09-01',
      periodEnd: '2026-10-01',
      recordedAt: '2026-10-02',
      source: 'Hosting invoice total',
    };
    expect(operatingCostRecord(JSON.stringify(row), now)).toMatchObject({
      amountUsd: '7.00',
      stale: true,
    });
    for (const patch of [
      { kind: 'forecast' },
      { amountUsd: '-1' },
      { recordedAt: '2027-01-01' },
      { periodEnd: 'bad' },
    ])
      expect(
        operatingCostRecord(JSON.stringify({ ...row, ...patch }), now),
      ).toBeNull();
    expect(operatingCostRecord('invalid', now)).toBeNull();
  });
});
