import { paymentsAbi } from '@runway/mezo';
import type { Address, PublicClient } from 'viem';

export const schedulePageSize = 20n;
export type ScheduleCursor = {
  blockNumber: bigint;
  chainTime: bigint;
  sentOffset?: bigint;
  receivedOffset?: bigint;
};

export async function readSchedulePage(
  client: PublicClient,
  contract: Address,
  account?: Address,
  scheduleId?: bigint,
  cursor?: ScheduleCursor,
) {
  const snapshot = cursor ?? (await client.getBlock());
  const blockNumber =
    'blockNumber' in snapshot ? snapshot.blockNumber : snapshot.number;
  const chainTime =
    'chainTime' in snapshot ? snapshot.chainTime : snapshot.timestamp;
  const pinned = { address: contract, abi: paymentsAbi, blockNumber };
  let ids: readonly bigint[];
  let next: ScheduleCursor | undefined;
  if (scheduleId !== undefined) ids = [scheduleId];
  else {
    if (!account) throw new Error('Connect an account to discover schedules.');
    const sentOffset = cursor ? cursor.sentOffset : 0n;
    const receivedOffset = cursor ? cursor.receivedOffset : 0n;
    const [sent, received] = await Promise.all([
      sentOffset === undefined
        ? []
        : client.readContract({
            ...pinned,
            functionName: 'getSenderScheduleIds',
            args: [account, sentOffset, schedulePageSize],
          }),
      receivedOffset === undefined
        ? []
        : client.readContract({
            ...pinned,
            functionName: 'getRecipientScheduleIds',
            args: [account, receivedOffset, schedulePageSize],
          }),
    ]);
    const nextSent =
      sent.length === Number(schedulePageSize) && sentOffset !== undefined
        ? sentOffset + BigInt(sent.length)
        : undefined;
    const nextReceived =
      received.length === Number(schedulePageSize) &&
      receivedOffset !== undefined
        ? receivedOffset + BigInt(received.length)
        : undefined;
    if (nextSent !== undefined || nextReceived !== undefined)
      next = {
        blockNumber,
        chainTime,
        sentOffset: nextSent,
        receivedOffset: nextReceived,
      };
    ids = [...new Set([...sent, ...received])];
  }
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [schedule, claimable] = await Promise.all([
        client.readContract({
          ...pinned,
          functionName: 'getSchedule',
          args: [id],
        }),
        client.readContract({
          ...pinned,
          functionName: 'claimable',
          args: [id],
        }),
      ]);
      return { id, ...schedule, claimable, chainTime };
    }),
  );
  return { rows, next, blockNumber, chainTime };
}

export function uniqueSchedules(
  pages: readonly Awaited<ReturnType<typeof readSchedulePage>>[],
) {
  const rows = new Map(
    pages.flatMap((page) => page.rows).map((row) => [row.id, row]),
  );
  return [...rows.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}
