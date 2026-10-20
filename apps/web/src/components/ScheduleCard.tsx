import { getAddress, type Address } from 'viem';
import { explorer } from '../config';
import { amount, short } from '../format';
import { TransactionHistory } from '../TransactionHistory';
import type { readSchedulePage } from '../schedules';
export type ScheduleCardProps = {
  s: Awaited<ReturnType<typeof readSchedulePage>>['rows'][number];
  address?: Address;
  decimals: number;
  canTransact: boolean;
  settle: (id: bigint, cancel: boolean) => Promise<void>;
  historyRevision: number;
};
export function ScheduleCard({
  s,
  address,
  decimals,
  canTransact,
  settle,
  historyRevision,
}: ScheduleCardProps) {
  return (
    <article className="schedule-card" key={String(s.id)}>
      <div className="section-heading">
        <a href={`/schedules/${s.id}`}>
          <strong>Schedule #{String(s.id)}</strong>
        </a>
        <span className="badge">
          {s.cancelled
            ? 'CANCELLED'
            : s.claimed === s.total
              ? 'COMPLETED'
              : 'FUNDED'}
        </span>
      </div>
      <p>
        Recipient:{' '}
        <a href={`${explorer}/address/${s.recipient}`} title={s.recipient}>
          {short(s.recipient)}
        </a>
      </p>
      <dl>
        <div>
          <dt>Total funded</dt>
          <dd>{amount(s.total, decimals)} MUSD</dd>
        </div>
        <div>
          <dt>Already claimed</dt>
          <dd>{amount(s.claimed, decimals)} MUSD</dd>
        </div>
        <div>
          <dt>Claimable now</dt>
          <dd>{amount(s.claimable, decimals)} MUSD</dd>
        </div>
        {s.cancelled ? (
          <>
            <div>
              <dt>Total earned by recipient</dt>
              <dd>{amount(s.vestedAtCancellation, decimals)} MUSD</dd>
            </div>
            <div>
              <dt>Refunded to sender</dt>
              <dd>{amount(s.total - s.vestedAtCancellation, decimals)} MUSD</dd>
            </div>
          </>
        ) : null}
      </dl>
      {s.cancelled ? (
        <p className="hint">
          {s.claimable === 0n
            ? 'Cancellation settled. All earned MUSD has been paid; the unearned portion was refunded to the sender.'
            : 'Accrual stopped. The unearned portion was refunded; earned, unpaid MUSD remains claimable.'}
        </p>
      ) : s.claimed === s.total ? (
        <p className="hint">
          Payment complete. All funded MUSD has been paid to the recipient.
        </p>
      ) : s.chainTime >= s.end ? (
        <p className="hint">
          Accrual ended. Claim the remaining earned MUSD to complete this
          payment.
        </p>
      ) : null}
      <p className="hint">
        {new Date(Number(s.start) * 1000).toLocaleString()} →{' '}
        {new Date(Number(s.end) * 1000).toLocaleString()} (your local timezone)
      </p>
      <div className="actions">
        <button
          className="button"
          disabled={!canTransact || s.claimable === 0n}
          onClick={() => void settle(s.id, false)}
        >
          Claim to recipient
        </button>
        {address &&
        getAddress(address) === getAddress(s.sender) &&
        !s.cancelled &&
        s.chainTime < s.end ? (
          <button
            className="button secondary"
            disabled={!canTransact}
            onClick={() => {
              if (
                window.confirm(
                  'Cancel this schedule? Unvested funds return to you; unpaid vested funds remain claimable. Final amounts depend on chain execution time.',
                )
              )
                void settle(s.id, true);
            }}
          >
            Cancel schedule
          </button>
        ) : null}
        <a href={`/schedules/${s.id}`}>Recipient link ↗</a>
      </div>
      <TransactionHistory scheduleId={s.id} revision={historyRevision} />
    </article>
  );
}
