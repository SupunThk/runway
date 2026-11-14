import type { Db } from 'mongodb';
import { formatUnits, isAddress } from 'viem';
import {
  paymentDeployment,
  reconciliationState,
  type IndexedSchedule,
} from './reconciliation.ts';

/**
 * Deterministic, read-only lookups over the public payment index. The server
 * computes every value shown; the model only explains these facts in prose.
 * Nothing here needs a session: schedules and their parties are public chain data.
 */
export type LiveFacts = {
  kind: 'schedule' | 'address';
  title: string;
  url: string;
  rows: { label: string; value: string }[];
  note: string;
  asOf: { block: string | null; checkedAt: string | null };
  available: boolean;
};
export type LiveLookup = (question: string) => Promise<LiveFacts | null>;

const MUSD_DECIMALS = 18;
const ADDRESS_ROW_LIMIT = 500;
const musd = (baseUnits: bigint) =>
  `${formatUnits(baseUnits, MUSD_DECIMALS)} MUSD`;
const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export function detectLookup(
  question: string,
):
  | { kind: 'schedule'; id: string }
  | { kind: 'address'; address: string }
  | null {
  const schedule = /\b(?:schedule|payment)\s*#?\s*(\d{1,9})\b/i.exec(question);
  if (schedule && Number(schedule[1]) > 0)
    return { kind: 'schedule', id: String(Number(schedule[1])) };
  const address = /\b(0x[a-fA-F0-9]{40})\b/.exec(question)?.[1]?.toLowerCase();
  if (
    address &&
    isAddress(address) &&
    BigInt(address) !== 0n &&
    // Contract addresses appear in the docs; looking them up as senders would mislead.
    address !== paymentDeployment.address &&
    address !== paymentDeployment.token
  )
    return { kind: 'address', address };
  return null;
}

export function createLiveLookup(
  db: Db,
  now: () => Date = () => new Date(),
): LiveLookup {
  return async (question) => {
    const target = detectLookup(question);
    if (!target) return null;
    const { state, available } = await reconciliationState(db, now());
    const asOf = {
      block: state?.block ?? null,
      checkedAt: state?.checkedAt?.toISOString() ?? null,
    };
    const title =
      target.kind === 'schedule'
        ? `Schedule #${target.id}`
        : `Public schedules for ${short(target.address)}`;
    const url =
      target.kind === 'schedule'
        ? `/schedules/${target.id}`
        : `/proof/${target.address}`;
    if (!available || !state?.generation)
      return {
        kind: target.kind,
        title,
        url,
        rows: [],
        note: 'The public payment index is catching up or unavailable right now, so no live status is shown. Open the page for a direct chain read.',
        asOf,
        available: false,
      };
    const schedules = db.collection<IndexedSchedule>('paymentSchedules');
    if (target.kind === 'schedule') {
      const row = await schedules.findOne({
        generation: state.generation,
        scheduleId: target.id,
      });
      if (!row)
        return {
          kind: 'schedule',
          title,
          url,
          rows: [
            { label: 'Status', value: 'Not found in the confirmed index' },
          ],
          note: 'No schedule with this ID is in the confirmed index. It may not exist yet or may still be inside the 12-block confirmation buffer.',
          asOf,
          available: true,
        };
      const total = BigInt(row.total);
      const claimed = BigInt(row.claimed);
      const vested = BigInt(row.vestedAtCancellation);
      const status = row.cancelled
        ? 'Cancelled'
        : claimed === total
          ? 'Paid in full (fully claimed)'
          : claimed > 0n
            ? 'Partially claimed'
            : 'Funded, nothing claimed yet';
      const rows = [
        { label: 'Status', value: status },
        { label: 'Total funded', value: musd(total) },
        { label: 'Claimed by recipient', value: musd(claimed) },
        { label: 'Sender', value: short(row.sender) },
        { label: 'Recipient', value: short(row.recipient) },
      ];
      if (row.cancelled)
        rows.push(
          { label: 'Earned at cancellation', value: musd(vested) },
          { label: 'Refunded to sender', value: musd(total - vested) },
          {
            label: 'Earned but not yet claimed',
            value: musd(vested > claimed ? vested - claimed : 0n),
          },
        );
      return {
        kind: 'schedule',
        title,
        url,
        rows,
        note: 'Confirmed index snapshot. The amount claimable right now depends on chain time; open the schedule page for a live read.',
        asOf,
        available: true,
      };
    }
    const matches = await schedules
      .find({
        generation: state.generation,
        $or: [{ sender: target.address }, { recipient: target.address }],
      })
      .limit(ADDRESS_ROW_LIMIT)
      .toArray();
    const sent = { count: 0, total: 0n, claimed: 0n, cancelled: 0 };
    const received = { count: 0, total: 0n, claimed: 0n };
    for (const row of matches) {
      if (row.sender === target.address) {
        sent.count++;
        sent.total += BigInt(row.total);
        sent.claimed += BigInt(row.claimed);
        if (row.cancelled) sent.cancelled++;
      }
      if (row.recipient === target.address) {
        received.count++;
        received.total += BigInt(row.total);
        received.claimed += BigInt(row.claimed);
      }
    }
    const capped = matches.length >= ADDRESS_ROW_LIMIT;
    return {
      kind: 'address',
      title,
      url,
      rows: [
        { label: 'Schedules sent', value: String(sent.count) },
        { label: 'Funded as sender', value: musd(sent.total) },
        { label: 'Claimed from sent schedules', value: musd(sent.claimed) },
        { label: 'Sent schedules cancelled', value: String(sent.cancelled) },
        { label: 'Schedules received', value: String(received.count) },
        { label: 'Received schedule totals', value: musd(received.total) },
        { label: 'Claimed as recipient', value: musd(received.claimed) },
      ],
      note: `${capped ? `Partial: only the first ${ADDRESS_ROW_LIMIT} schedules were counted. ` : ''}Original funding totals from the confirmed index, not wallet balances or proof of ownership. The funding proof page shows remaining committed MUSD at a pinned block.`,
      asOf,
      available: true,
    };
  };
}
