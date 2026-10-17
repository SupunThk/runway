import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { zeroHash, type Address, type Hash } from 'viem';
import {
  indexBatch,
  indexKey,
  paymentDeployment,
  reconcileInvoices,
  type ChainSchedule,
  type IndexSource,
  type IndexState,
} from './reconciliation.ts';

const sender = '0x0000000000000000000000000000000000000011' as Address;
const recipient = '0x0000000000000000000000000000000000000022' as Address;
const reference = `0x${'ab'.repeat(32)}` as Hash;
const hash = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}` as Hash;
const start = paymentDeployment.startBlock;
let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let head: bigint;
let fork: bigint;
let claimed: bigint;
let cancelled: boolean;
let broken: boolean;
let duplicate: boolean;
let midReorg: boolean;
let calls: number;
const schedule = (): ChainSchedule => ({
  sender,
  recipient,
  total: 100n,
  claimed,
  cancelled,
  vestedAtCancellation: cancelled ? 60n : 0n,
  start: 1n,
  end: 2n,
  referenceHash: reference,
});
const source: IndexSource = {
  async verify() {
    if (broken) throw new Error('Wrong deployment');
  },
  async head() {
    return head;
  },
  async block(n) {
    calls++;
    return {
      hash: hash(n + fork + (midReorg && calls > 3 ? 100n : 0n)),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
  },
  async events(from, to) {
    const row = {
      scheduleId: 1n,
      blockNumber: to,
      blockHash: hash(to + fork),
      transactionHash: hash(to),
      logIndex: 0,
      name: 'ScheduleCreated',
    };
    return from <= to ? (duplicate ? [row, row] : [row]) : [];
  },
  async schedule() {
    return schedule();
  },
};
const invoice = {
  _id: 'invoice',
  recipient,
  amountBaseUnits: '100',
  paymentReference: reference,
};
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db('reconciliation');
}, 600000);
beforeEach(async () => {
  await db.dropDatabase();
  head = start + 12n;
  fork = 0n;
  claimed = 0n;
  cancelled = false;
  broken = false;
  duplicate = false;
  midReorg = false;
  calls = 0;
});
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});
async function payment() {
  return (await reconcileInvoices(db, [invoice], sender)).items[0].payment;
}
describe('confirmed payment reconciliation', () => {
  it('rejects stale RPC tips and prevents an expired worker from publishing', async () => {
    await expect(
      indexBatch(db, {
        ...source,
        async block(n) {
          return { hash: hash(n), timestamp: 1n };
        },
      }),
    ).rejects.toThrow('RPC head is stale');
    await expect(
      indexBatch(db, {
        ...source,
        async schedule() {
          await db.collection<IndexState>('paymentIndex').updateOne(
            { _id: indexKey },
            {
              $set: {
                lease: 'replacement',
                leaseUntil: new Date(Date.now() + 60000),
              },
            },
          );
          return schedule();
        },
      }),
    ).rejects.toThrow('Indexer lease expired');
    expect(
      (await db.collection('paymentIndex').findOne({}))!.generation,
    ).toBeUndefined();
  });
  it('waits for confirmations, resumes bounded checkpoints, and deduplicates replayed logs', async () => {
    head = start + 22n;
    duplicate = true;
    await indexBatch(db, source, { batchSize: 5n });
    expect((await payment()).status).toBe('unavailable');
    expect((await db.collection('paymentIndex').findOne({}))!.block).toBe(
      (start + 4n).toString(),
    );
    await indexBatch(db, source, { batchSize: 5n });
    await indexBatch(db, source, { batchSize: 5n });
    expect((await payment()).status).toBe('funded');
    expect(await db.collection('paymentEvents').countDocuments()).toBe(3);
    await indexBatch(db, source);
    expect(await db.collection('paymentEvents').countDocuments()).toBe(3);
  });
  it('tracks partial claims, full claims and cancellation refunds without marking vested money paid', async () => {
    await indexBatch(db, source);
    expect((await payment()).status).toBe('funded');
    head++;
    claimed = 25n;
    await indexBatch(db, source);
    expect(await payment()).toMatchObject({
      status: 'partially_claimed',
      claimedBaseUnits: '25',
      outstandingBaseUnits: '75',
    });
    head++;
    cancelled = true;
    await indexBatch(db, source);
    expect(await payment()).toMatchObject({
      status: 'cancelled',
      refundedBaseUnits: '40',
      outstandingBaseUnits: '35',
    });
    head++;
    claimed = 60n;
    await indexBatch(db, source);
    expect(await payment()).toMatchObject({
      status: 'cancelled',
      outstandingBaseUnits: '0',
    });
    head++;
    cancelled = false;
    claimed = 100n;
    await indexBatch(db, source);
    expect((await payment()).status).toBe('paid');
  });
  it('rejects mismatched owners and exact base-unit amounts, stale evidence and duplicate references', async () => {
    await indexBatch(db, source);
    expect(
      (await reconcileInvoices(db, [invoice], recipient)).items[0].payment
        .status,
    ).toBe('draft');
    expect(
      (
        await reconcileInvoices(
          db,
          [{ ...invoice, amountBaseUnits: '101' }],
          sender,
        )
      ).items[0].payment.status,
    ).toBe('draft');
    expect(
      (
        await reconcileInvoices(
          db,
          [invoice],
          sender,
          new Date(Date.now() + 180000),
        )
      ).items[0].payment.status,
    ).toBe('unavailable');
    const row = await db.collection('paymentSchedules').findOne({});
    await db
      .collection('paymentSchedules')
      .insertOne({ ...row, _id: 'duplicate' as never, scheduleId: '2' });
    expect((await payment()).status).toBe('conflict');
  });
  it('rebuilds on a reorg, rolls back claims, and loses removed schedule associations', async () => {
    claimed = 100n;
    await indexBatch(db, source);
    expect((await payment()).status).toBe('paid');
    fork = 500n;
    claimed = 0n;
    await indexBatch(db, source);
    expect((await payment()).status).toBe('funded');
    fork = 1000n;
    await indexBatch(db, {
      ...source,
      async events() {
        return [];
      },
    });
    expect((await payment()).status).toBe('draft');
    expect(
      (await reconcileInvoices(db, [{ ...invoice, scheduleId: '1' }], sender))
        .items[0].payment.status,
    ).toBe('awaiting_confirmation');
  });
  it('never publishes partial work after RPC errors or a reorg during a batch, and retries', async () => {
    await indexBatch(db, source);
    const original = await db.collection('paymentIndex').findOne({});
    head++;
    await expect(
      indexBatch(db, {
        ...source,
        async schedule() {
          throw new Error('RPC down');
        },
      }),
    ).rejects.toThrow('RPC down');
    expect((await db.collection('paymentIndex').findOne({}))!.generation).toBe(
      original!.generation,
    );
    expect((await payment()).status).toBe('unavailable');
    calls = 0;
    midReorg = true;
    await expect(indexBatch(db, source)).rejects.toThrow('Chain changed');
    midReorg = false;
    await indexBatch(db, source);
    expect((await payment()).status).toBe('funded');
  });
  it('fences concurrent workers, expires abandoned leases and rejects deployment mismatches', async () => {
    await db.collection<IndexState>('paymentIndex').insertOne({
      _id: indexKey,
      lease: 'other',
      leaseUntil: new Date(Date.now() + 60000),
    });
    expect(await indexBatch(db, source)).toBe(false);
    await db
      .collection<IndexState>('paymentIndex')
      .updateOne({ _id: indexKey }, { $set: { leaseUntil: new Date(0) } });
    broken = true;
    await expect(indexBatch(db, source)).rejects.toThrow('Wrong deployment');
    expect(
      (await db.collection('paymentIndex').findOne({}))!.generation,
    ).toBeUndefined();
    broken = false;
    await indexBatch(db, source);
    expect((await payment()).status).toBe('funded');
  });
});
