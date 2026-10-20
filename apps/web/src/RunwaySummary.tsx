import { useAccount } from 'wagmi';
import { DAY_SECONDS } from '@runway/mezo';
import { formatUnits } from 'viem';
import { Icon } from './Icon';
import type { OverviewProps } from './routes/Overview';
import { localDate, usePayrollProjection } from './hooks/usePayrollProjection';

export function RunwaySummary(props: OverviewProps) {
  const { chainId } = useAccount();
  const payroll = usePayrollProjection({ ...props, chainId });
  return (
    <div className="info-card light">
      <span className="eyebrow">RUNWAY · BTC-BACKED PAYROLL</span>
      <h2>Your team, funded forward.</h2>
      {payroll.reason ? (
        <p>
          {!props.address
            ? 'Connect and fund a schedule to see your runway.'
            : payroll.reason}
        </p>
      ) : payroll.covered === undefined ? (
        <p>Connect and fund a schedule to see your runway.</p>
      ) : (
        <>
          <p>Payroll covered until {localDate(payroll.covered)}</p>
          <p>
            {formatUnits(payroll.rate! * DAY_SECONDS, 18)} MUSD/day across{' '}
            {payroll.active!.length} active schedules
          </p>
          <p className="hint">
            Assumes immediate renewal of current streams. Future-starting
            schedules are excluded; rates round up conservatively.
          </p>
        </>
      )}
      <div className="actions">
        <a href="/borrowing" className="button secondary">
          View borrowing <Icon name="arrow" />
        </a>
        <a href="/borrowing">Plan with your BTC loan →</a>
      </div>
    </div>
  );
}
