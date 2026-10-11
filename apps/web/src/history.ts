import { paymentsAbi, TESTNET_CHAIN_ID } from '@runway/mezo';
import { formatUnits, type Address, type Hash, type PublicClient } from 'viem';

// This start block is verified only for the existing testnet deployment.
export const historyDeployment = '0x01a1662f2eb6c15bfb2c8fd010c53c9055478b7d';
export const deploymentBlock = 16083735n;
export type HistoryRecord = {
  event: 'ScheduleCreated' | 'Claimed' | 'Cancelled';
  transactionHash: Hash;
  blockHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  timestamp: bigint;
  amount: bigint;
  account: Address;
  vested?: bigint;
};
export type HistoryCursor = { from: bigint; head?: bigint };

export async function readHistoryPage(
  client: PublicClient,
  address: Address,
  scheduleId: bigint,
  cursor: HistoryCursor,
) {
  if (address.toLowerCase() !== historyDeployment)
    throw new Error(
      'History start block is not configured for this deployment.',
    );
  const head = cursor.head ?? (await client.getBlockNumber({ cacheTime: 0 }));
  if (head < deploymentBlock)
    throw new Error('RPC head is before the deployment block.');
  const end = cursor.from + 9999n < head ? cursor.from + 9999n : head;
  const records: HistoryRecord[] = [];
  const timestamps = new Map<Hash, bigint>();
  // Ten bounded RPC chunks per page. A failed page can be retried without
  // discarding previously loaded pages or claiming the failed range was scanned.
  for (let from = cursor.from; from <= end; from += 1000n) {
    const to = from + 999n < end ? from + 999n : end;
    // An explicit event name is required for viem to encode indexed args.
    const groups = await Promise.all(
      (['ScheduleCreated', 'Claimed', 'Cancelled'] as const).map((eventName) =>
        client.getContractEvents({
          address,
          abi: paymentsAbi,
          eventName,
          args: { scheduleId },
          fromBlock: from,
          toBlock: to,
          strict: true,
        }),
      ),
    );
    const logs = groups.flat();
    for (const log of logs) {
      if (
        log.removed ||
        log.args.scheduleId !== scheduleId ||
        log.blockNumber === null ||
        log.blockHash === null ||
        log.transactionHash === null ||
        log.logIndex === null ||
        log.blockNumber < from ||
        log.blockNumber > to
      )
        continue;
      if (!timestamps.has(log.blockHash)) {
        const block = await client.getBlock({ blockHash: log.blockHash });
        timestamps.set(log.blockHash, block.timestamp);
      }
      const args = log.args;
      records.push({
        event: log.eventName,
        transactionHash: log.transactionHash,
        blockHash: log.blockHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        timestamp: timestamps.get(log.blockHash)!,
        amount:
          'total' in args
            ? args.total
            : 'refund' in args
              ? args.refund
              : args.amount,
        account: 'sender' in args ? args.sender : args.recipient,
        ...('vested' in args ? { vested: args.vested } : {}),
      });
    }
  }
  return {
    records,
    end,
    head,
    next: end < head ? { from: end + 1n, head } : undefined,
  };
}

export function orderedHistory(records: HistoryRecord[]) {
  return [
    ...new Map(
      records.map((r) => [`${r.blockHash}:${r.logIndex}`, r]),
    ).values(),
  ].sort((a, b) =>
    a.blockNumber < b.blockNumber
      ? -1
      : a.blockNumber > b.blockNumber
        ? 1
        : a.logIndex - b.logIndex,
  );
}

export function eventReceipt(
  record: HistoryRecord,
  address: Address,
  scheduleId: bigint,
) {
  return (
    JSON.stringify(
      {
        receiptType: 'Runway onchain event evidence',
        chainId: TESTNET_CHAIN_ID,
        contract: address,
        scheduleId,
        ...record,
        amountMUSD: formatUnits(record.amount, 18),
        timestampUTC: new Date(Number(record.timestamp) * 1000).toISOString(),
      },
      (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ) + '\n'
  );
}

export function historyCsv(
  records: HistoryRecord[],
  address: Address,
  scheduleId: bigint,
  coverage: { end: bigint; head: bigint },
  explorer: string,
) {
  const rows: unknown[][] = [
    [
      'chain_id',
      'contract',
      'schedule_id',
      'event',
      'timestamp_utc',
      'amount_musd',
      'amount_base_units',
      'account',
      'vested_musd',
      'transaction_hash',
      'transaction_url',
      'block_number',
      'block_hash',
      'log_index',
      'scan_from_block',
      'scan_through_block',
      'snapshot_head',
      'complete_through_snapshot',
    ],
  ];
  for (const record of orderedHistory(records))
    rows.push([
      TESTNET_CHAIN_ID,
      address,
      scheduleId,
      record.event,
      new Date(Number(record.timestamp) * 1000).toISOString(),
      formatUnits(record.amount, 18),
      record.amount,
      record.account,
      record.vested === undefined ? '' : formatUnits(record.vested, 18),
      record.transactionHash,
      `${explorer}/tx/${record.transactionHash}`,
      record.blockNumber,
      record.blockHash,
      record.logIndex,
      deploymentBlock,
      coverage.end,
      coverage.head,
      coverage.end === coverage.head,
    ]);
  return (
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}
