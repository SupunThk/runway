import { RunwaySummary } from '../RunwaySummary';
import {
  TreasuryLedger,
  type TreasuryLedgerProps,
} from '../components/TreasuryLedger';
import {
  ScheduleList,
  type ScheduleListProps,
} from '../components/ScheduleList';
import { RecipientEarnings } from '../components/RecipientEarnings';
import { GettingStarted } from '../components/GettingStarted';
export type OverviewProps = TreasuryLedgerProps &
  ScheduleListProps & {
    busy: boolean;
    claimMany: (ids: bigint[]) => Promise<void>;
    chainId?: number;
  };
export function Overview(props: OverviewProps) {
  return (
    <>
      {props.scheduleId === undefined ? (
        <GettingStarted
          state={{
            address: props.address,
            chainId: props.chainId,
            btc: props.balances.data?.btc,
            musd: props.balances.data?.musd,
            hasSchedule: Boolean(props.scheduleRows?.length),
          }}
          balancesLoaded={
            Boolean(props.balances.data) && !props.schedules.isPending
          }
          onCreate={() => props.setView('create')}
        />
      ) : null}
      <TreasuryLedger {...props} />
      {props.scheduleId === undefined ? (
        <RecipientEarnings
          address={props.address}
          rows={props.schedules.error ? undefined : props.scheduleRows}
          decimals={props.decimals}
          partial={Boolean(props.schedules.hasNextPage)}
          canTransact={props.canTransact}
          busy={props.busy}
          claimMany={props.claimMany}
        />
      ) : null}
      <ScheduleList {...props} />{' '}
      <section className="info-grid">
        <div className="info-card">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>Committed once. Claimed over time.</h2>
          <ol className="payment-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Fund a schedule</h3>
                <p>Deposit the full payment in MUSD.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Let it accrue</h3>
                <p>Your recipient earns over the schedule’s duration.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Claim what’s earned</h3>
                <p>The recipient claims with an onchain transaction.</p>
              </div>
            </li>
          </ol>
        </div>
        <RunwaySummary {...props} />
      </section>
    </>
  );
}
