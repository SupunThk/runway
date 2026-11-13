import { formatUnits, type Address } from 'viem';
import { amount } from '../format';
import type { readSchedulePage } from '../schedules';

type Row = Awaited<ReturnType<typeof readSchedulePage>>['rows'][number];

/** Builds earnings totals for the schedules this wallet receives. */
export function recipientSummary(rows: readonly Row[], address: Address) {
  const mine = rows.filter(
    (r) => r.recipient.toLowerCase() === address.toLowerCase(),
  );
  let entitled = 0n,
    claimed = 0n,
    claimable = 0n;
  for (const r of mine) {
    entitled += r.cancelled ? r.vestedAtCancellation : r.total;
    claimed += r.claimed;
    claimable += r.claimable;
  }
  return {
    rows: mine,
    entitled,
    claimed,
    claimable,
    vesting: entitled - claimed - claimable,
    claimableIds: mine.filter((r) => r.claimable > 0n).map((r) => r.id),
  };
}

export function receivedCsv(rows: readonly Row[], decimals: number) {
  const iso = (t: bigint) => new Date(Number(t) * 1000).toISOString();
  // Values are addresses, integers and ISO dates, so none can start a formula.
  const lines = rows.map((r) =>
    [
      r.id.toString(),
      r.sender,
      formatUnits(r.total, decimals),
      formatUnits(r.claimed, decimals),
      formatUnits(r.claimable, decimals),
      iso(r.start),
      iso(r.end),
      r.cancelled
        ? 'cancelled'
        : r.claimed === r.total
          ? 'completed'
          : 'active',
    ].join(','),
  );
  return [
    'schedule_id,sender,total_musd,claimed_musd,claimable_musd,start_utc,end_utc,status',
    ...lines,
  ].join('\n');
}

export function RecipientEarnings({
  address,
  rows,
  decimals,
  partial,
  canTransact,
  busy,
  claimMany,
}: {
  address?: Address;
  rows?: readonly Row[];
  decimals: number;
  partial: boolean;
  canTransact: boolean;
  busy: boolean;
  claimMany: (ids: bigint[]) => Promise<void>;
}) {
  if (!address || !rows) return null;
  const summary = recipientSummary(rows, address);
  if (!summary.rows.length) return null;
  const count = summary.claimableIds.length;
  return (
    <section className="panel earnings" aria-label="Your earnings">
      <div className="section-heading">
        <div>
          <span className="eyebrow">AS A RECIPIENT</span>
          <h2>Your earnings</h2>
          <p>
            Across {summary.rows.length} schedule
            {summary.rows.length === 1 ? '' : 's'} paid to this wallet
            {partial ? ' (loaded so far; load more for the full total)' : ''}.
          </p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([receivedCsv(summary.rows, decimals)], {
                type: 'text/csv',
              }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = `runway-earnings-${address.slice(0, 8)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export CSV
        </button>
      </div>
      <dl className="earnings-values">
        <div>
          <dt>Claimable now</dt>
          <dd>{amount(summary.claimable, decimals)} MUSD</dd>
        </div>
        <div>
          <dt>Already claimed</dt>
          <dd>{amount(summary.claimed, decimals)} MUSD</dd>
        </div>
        <div>
          <dt>Still vesting</dt>
          <dd>{amount(summary.vesting, decimals)} MUSD</dd>
        </div>
        <div>
          <dt>Total you’ll receive</dt>
          <dd>{amount(summary.entitled, decimals)} MUSD</dd>
        </div>
      </dl>
      <div className="earnings-action">
        <button
          type="button"
          className="button"
          disabled={!count || !canTransact || busy}
          onClick={() => void claimMany(summary.claimableIds)}
        >
          {busy
            ? 'Claiming…'
            : count
              ? `Claim all available (${count})`
              : 'Nothing to claim yet'}
        </button>
        <p className="hint">
          {count > 1
            ? `Your wallet asks you to confirm ${count} claims, one per schedule. The batch stops if you reject one.`
            : count === 1
              ? 'One wallet confirmation. MUSD goes to this wallet.'
              : 'Earnings unlock continuously; check back later.'}
          {!canTransact && count ? ' Connect to Mezo testnet to claim.' : ''}
        </p>
      </div>
    </section>
  );
}
