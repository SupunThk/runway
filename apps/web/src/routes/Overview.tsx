import { Icon } from '../Icon';
import {
  TreasuryLedger,
  type TreasuryLedgerProps,
} from '../components/TreasuryLedger';
import {
  ScheduleList,
  type ScheduleListProps,
} from '../components/ScheduleList';
export type OverviewProps = TreasuryLedgerProps & ScheduleListProps;
export function Overview(props: OverviewProps) {
  return (
    <>
      <TreasuryLedger {...props} />
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
        <div className="info-card light">
          <span className="eyebrow">MEZO BORROWING</span>
          <h2>Keep an eye on your BTC-backed loan.</h2>
          <p>
            View collateral, MUSD debt and BTC price-drop scenarios in your
            borrowing dashboard.
          </p>
          <a href="/borrowing" className="button secondary">
            View borrowing <Icon name="arrow" />
          </a>
        </div>
      </section>
    </>
  );
}
