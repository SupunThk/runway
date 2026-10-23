import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { type Db, MongoServerError } from 'mongodb';
import type { DirectVerifier } from './direct-payments.ts';
import {
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hash,
} from 'viem';

const deployment = JSON.parse(
  readFileSync(
    new URL('../../../deployments/mezo-testnet.payments.json', import.meta.url),
    'utf8',
  ),
);
export const paymentDeployment = {
  chainId: 31611,
  address: deployment.address.toLowerCase() as Address,
  token: deployment.musd.toLowerCase() as Address,
  startBlock: BigInt(deployment.deploymentBlock),
  codeHash: deployment.deployedBytecodeHash as Hash,
};
export const indexKey = `${paymentDeployment.chainId}:${paymentDeployment.address}`;
const abi = parseAbi([
  'struct Schedule { address sender; address recipient; uint256 total; uint64 start; uint64 end; uint256 claimed; bool cancelled; uint256 vestedAtCancellation; bytes32 referenceHash; }',
  'function musd() view returns (address)',
  'function getSchedule(uint256 id) view returns (Schedule)',
  'event ScheduleCreated(uint256 indexed scheduleId, address indexed sender, address indexed recipient, uint256 total, uint64 start, uint64 end, bytes32 referenceHash)',
  'event Claimed(uint256 indexed scheduleId, address indexed recipient, uint256 amount)',
  'event Cancelled(uint256 indexed scheduleId, address indexed sender, uint256 refund, uint256 vested)',
]);
export type ChainSchedule = {
  sender: Address;
  recipient: Address;
  total: bigint;
  start: bigint;
  end: bigint;
  claimed: bigint;
  cancelled: boolean;
  vestedAtCancellation: bigint;
  referenceHash: Hash;
};
export type ChainEvent = {
  scheduleId: bigint;
  blockNumber: bigint;
  blockHash: Hash;
  transactionHash: Hash;
  logIndex: number;
  name: string;
};
export interface IndexSource {
  verify(): Promise<void>;
  head(): Promise<bigint>;
  block(number: bigint): Promise<{ hash: Hash; timestamp: bigint }>;
  events(from: bigint, to: bigint): Promise<ChainEvent[]>;
  schedule(id: bigint, at: bigint): Promise<ChainSchedule>;
}
export function rpcIndexSource(): IndexSource {
  const client = createPublicClient({
    transport: http(
      process.env.INDEXER_RPC_URL || 'https://rpc.test.mezo.org',
      { timeout: 15000, retryCount: 2 },
    ),
  });
  const address = paymentDeployment.address;
  return {
    async verify() {
      if ((await client.getChainId()) !== paymentDeployment.chainId)
        throw new Error('Wrong indexer chain');
      const code = await client.getCode({ address });
      if (!code || keccak256(code) !== paymentDeployment.codeHash)
        throw new Error('Payment bytecode mismatch');
      const token = await client.readContract({
        address,
        abi,
        functionName: 'musd',
      });
      if (token.toLowerCase() !== paymentDeployment.token)
        throw new Error('Payment token mismatch');
    },
    head: () => client.getBlockNumber({ cacheTime: 0 }),
    async block(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash) throw new Error('Missing block hash');
      return { hash: block.hash, timestamp: block.timestamp };
    },
    async events(fromBlock, toBlock) {
      const logs = await client.getLogs({
        address,
        events: abi.filter((item) => item.type === 'event'),
        fromBlock,
        toBlock,
        strict: true,
      });
      return logs.map((log) => {
        if (
          log.removed ||
          log.blockNumber === null ||
          !log.blockHash ||
          !log.transactionHash ||
          log.logIndex === null ||
          log.args.scheduleId === undefined
        )
          throw new Error('Incomplete event');
        return {
          scheduleId: log.args.scheduleId,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          name: log.eventName,
        };
      });
    },
    schedule: (id, blockNumber) =>
      client.readContract({
        address,
        abi,
        functionName: 'getSchedule',
        args: [id],
        blockNumber,
      }),
  };
}
export type IndexedSchedule = {
  _id: string;
  generation: string;
  scheduleId: string;
  sender: string;
  recipient: string;
  total: string;
  claimed: string;
  cancelled: boolean;
  vestedAtCancellation: string;
  referenceHash: string;
  expiresAt?: Date;
};
export type IndexState = {
  _id: string;
  generation?: string;
  block?: string;
  hash?: Hash;
  checkedAt?: Date;
  ready?: boolean;
  lease?: string;
  leaseUntil?: Date;
  error?: string;
};

// Each batch writes a new immutable generation. Only a fenced pointer swap publishes it.
// Readers keep the prior complete snapshot through crashes, RPC failures and competing workers.
export async function indexBatch(
  db: Db,
  source: IndexSource,
  options: { confirmations?: bigint; batchSize?: bigint; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const confirmations = options.confirmations ?? 12n;
  const size = options.batchSize ?? 500n;
  if (confirmations < 1n || size < 1n || size > 5000n)
    throw new Error('Invalid index bounds');
  const states = db.collection<IndexState>('paymentIndex');
  try {
    await states.updateOne(
      { _id: indexKey },
      { $setOnInsert: { ready: false } },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
  }
  const lease = randomUUID();
  const state = await states.findOneAndUpdate(
    {
      _id: indexKey,
      $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
    },
    { $set: { lease, leaseUntil: new Date(now.getTime() + 120000) } },
    { returnDocument: 'after' },
  );
  if (!state) return false;
  const generation = randomUUID();
  try {
    await source.verify();
    const head = await source.head();
    const tip = await source.block(head);
    const tipAge = BigInt(Math.floor(now.getTime() / 1000)) - tip.timestamp;
    if (tipAge > 300n || tipAge < -30n) throw new Error('RPC head is stale');
    const safe = head - confirmations;
    let previous = state.block
      ? BigInt(state.block)
      : paymentDeployment.startBlock - 1n;
    let rebuild = false;
    if (
      (state.generation &&
        (!state.checkedAt ||
          now.getTime() - state.checkedAt.getTime() > 82800000)) ||
      (state.block &&
        (safe < previous || (await source.block(previous)).hash !== state.hash))
    ) {
      // Hide invalidated evidence before rebuilding from the deployment block.
      await states.updateOne(
        { _id: indexKey, lease },
        {
          $set: {
            ready: false,
            error: 'Rebuilding after chain reorganization.',
          },
        },
      );
      previous = paymentDeployment.startBlock - 1n;
      rebuild = true;
    }
    if (safe < paymentDeployment.startBlock)
      throw new Error('Deployment not confirmed');
    const target = previous + size < safe ? previous + size : safe;
    const checkpoint = await source.block(target);
    if (!rebuild && state.generation && target === previous) {
      await states.updateOne(
        { _id: indexKey, lease, leaseUntil: { $gt: new Date() } },
        {
          $set: { checkedAt: now, ready: true },
          $unset: { lease: '', leaseUntil: '', error: '' },
        },
      );
      return true;
    }
    const expiresAt = new Date(now.getTime() + 86400000);
    const snapshots = db.collection<IndexedSchedule>('paymentSchedules');
    if (!rebuild && state.generation) {
      for await (const row of snapshots.find({
        generation: state.generation,
      })) {
        await snapshots.insertOne({
          ...row,
          _id: `${generation}:${row.scheduleId}`,
          generation,
          expiresAt,
        });
      }
    }
    const events =
      target > previous ? await source.events(previous + 1n, target) : [];
    const touched = new Set<string>();
    const seen = new Set<string>();
    for (const event of events) {
      if (
        event.blockNumber <= previous ||
        event.blockNumber > target ||
        event.scheduleId < 1n
      )
        throw new Error('Event outside requested range');
      const key = `${event.transactionHash}:${event.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      touched.add(event.scheduleId.toString());
      await db
        .collection<{
          _id: string;
          generation: string;
          block: string;
          blockHash: Hash;
          transactionHash: Hash;
          logIndex: number;
          scheduleId: string;
          name: string;
        }>('paymentEvents')
        .insertOne({
          _id: `${generation}:${key}`,
          generation,
          block: event.blockNumber.toString(),
          blockHash: event.blockHash,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          scheduleId: event.scheduleId.toString(),
          name: event.name,
        });
    }
    for (const scheduleId of touched) {
      const row = await source.schedule(BigInt(scheduleId), target);
      if (
        row.claimed < 0n ||
        row.claimed > row.total ||
        row.vestedAtCancellation > row.total ||
        (row.cancelled && row.claimed > row.vestedAtCancellation)
      )
        throw new Error('Invalid schedule accounting');
      const snapshot: IndexedSchedule = {
        _id: `${generation}:${scheduleId}`,
        generation,
        expiresAt,
        scheduleId,
        sender: row.sender.toLowerCase(),
        recipient: row.recipient.toLowerCase(),
        total: row.total.toString(),
        claimed: row.claimed.toString(),
        cancelled: row.cancelled,
        vestedAtCancellation: row.vestedAtCancellation.toString(),
        referenceHash: row.referenceHash.toLowerCase(),
      };
      await snapshots.replaceOne({ _id: snapshot._id }, snapshot, {
        upsert: true,
      });
    }
    // Check both ends after all RPC reads, so a reorg during the batch cannot publish mixed evidence.
    if (
      (await source.block(target)).hash !== checkpoint.hash ||
      (!rebuild &&
        state.block &&
        (await source.block(BigInt(state.block))).hash !== state.hash)
    )
      throw new Error('Chain changed during indexing');
    const published = await states.updateOne(
      { _id: indexKey, lease, leaseUntil: { $gt: new Date() } },
      {
        $set: {
          generation,
          block: target.toString(),
          hash: checkpoint.hash,
          checkedAt: now,
          ready: target === safe,
        },
        $unset: { lease: '', leaseUntil: '', error: '' },
      },
    );
    if (published.modifiedCount !== 1) throw new Error('Indexer lease expired');
    return true;
  } catch (error) {
    await states.updateOne(
      { _id: indexKey, lease },
      {
        $set: { error: 'Payment indexing failed; retrying.' },
        $unset: { lease: '', leaseUntil: '' },
      },
    );
    throw error;
  }
}

export async function reconciliationState(db: Db, now = new Date()) {
  const state = await db
    .collection<IndexState>('paymentIndex')
    .findOne({ _id: indexKey });
  return {
    state,
    available: Boolean(
      state?.ready &&
      state.generation &&
      !state.error &&
      state.checkedAt &&
      now.getTime() - state.checkedAt.getTime() < 120000,
    ),
  };
}
export type ReconcilableInvoice = {
  _id: string;
  recipient: string;
  amountBaseUnits: string;
  paymentReference?: string;
  paymentKey?: string;
  scheduleId?: string;
  paymentType?: 'schedule' | 'one-time';
  transactionHash?: Hash;
  createdAt?: string;
};
export async function reconcileInvoices(
  db: Db,
  invoices: ReconcilableInvoice[],
  owner: string,
  now = new Date(),
  verifyDirectPayment?: DirectVerifier,
) {
  const { state, available } = await reconciliationState(db, now);
  const items = await Promise.all(
    invoices.map(async (invoice) => {
      if (invoice.paymentType === 'one-time') {
        const status = !invoice.transactionHash
          ? 'draft'
          : !verifyDirectPayment || !invoice.createdAt
            ? 'unavailable'
            : await verifyDirectPayment(
                invoice.transactionHash,
                { ...invoice, createdAt: invoice.createdAt },
                owner,
                now,
              );
        return {
          ...invoice,
          payment: {
            status: status === 'invalid' ? 'conflict' : status,
            transactionHash: invoice.transactionHash,
            ...(status === 'paid'
              ? {
                  fundedBaseUnits: invoice.amountBaseUnits,
                  claimedBaseUnits: invoice.amountBaseUnits,
                  refundedBaseUnits: '0',
                  outstandingBaseUnits: '0',
                }
              : {}),
          },
        };
      }
      const filter = invoice.scheduleId
        ? { scheduleId: invoice.scheduleId }
        : invoice.paymentReference
          ? { referenceHash: invoice.paymentReference }
          : null;
      const matches =
        available && filter
          ? await db
              .collection<IndexedSchedule>('paymentSchedules')
              .find({ generation: state!.generation, sender: owner, ...filter })
              .limit(3)
              .toArray()
          : [];
      const matching = matches.filter(
        (row) =>
          row.sender === owner &&
          row.recipient === invoice.recipient &&
          row.total === invoice.amountBaseUnits,
      );
      const row =
        matching.length === 1 && matches.length === 1 ? matching[0] : undefined;
      const status = !available
        ? 'unavailable'
        : matches.length > 1
          ? 'conflict'
          : !row
            ? invoice.scheduleId
              ? 'awaiting_confirmation'
              : 'draft'
            : row.cancelled
              ? 'cancelled'
              : row.claimed === row.total
                ? 'paid'
                : BigInt(row.claimed) > 0n
                  ? 'partially_claimed'
                  : 'funded';
      return {
        ...invoice,
        payment: {
          status,
          ...(row
            ? {
                scheduleId: row.scheduleId,
                fundedBaseUnits: row.total,
                claimedBaseUnits: row.claimed,
                refundedBaseUnits: row.cancelled
                  ? (
                      BigInt(row.total) - BigInt(row.vestedAtCancellation)
                    ).toString()
                  : '0',
                outstandingBaseUnits: (
                  (row.cancelled
                    ? BigInt(row.vestedAtCancellation)
                    : BigInt(row.total)) - BigInt(row.claimed)
                ).toString(),
              }
            : {}),
        },
      };
    }),
  );
  return {
    items,
    reconciliation: {
      status: available ? 'ready' : 'unavailable',
      block: state?.block ?? null,
      checkedAt: state?.checkedAt?.toISOString() ?? null,
      chainId: paymentDeployment.chainId,
      contract: paymentDeployment.address,
    },
  };
}
