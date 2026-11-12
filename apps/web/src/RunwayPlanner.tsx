import { useAccount } from 'wagmi';
import { DAY_SECONDS, TESTNET_CHAIN_ID } from '@runway/mezo';
import { formatUnits, parseUnits } from 'viem';
import { useState } from 'react';
import { useDeploymentReadiness } from './hooks/useDeploymentReadiness';
import { useBalances } from './hooks/useBalances';
import { useSchedules } from './hooks/useSchedules';
import { useBorrowingPosition } from './hooks/useBorrowingPosition';
import {
  localDate,
  isoDate,
  projectionAssumptions,
  usePayrollProjection,
} from './hooks/usePayrollProjection';
import { RunwayScenario } from './RunwayScenario';

export function RunwayPlanner() {
  const { address } = useAccount();
  return <PlannerContent key={address ?? 'disconnected'} />;
}
function PlannerContent() {
  const { address, chainId } = useAccount();
  const [reserveText, setReserveText] = useState('0');
  const reserveValid = /^\d{1,60}(\.\d{1,18})?$/.test(reserveText);
  const repaymentReserve = reserveValid ? parseUnits(reserveText, 18) : 0n;
  const readiness = useDeploymentReadiness();
  const balances = useBalances({ address, chainId, readiness });
  const {
    query: schedules,
    rows: scheduleRows,
    snapshot: scheduleSnapshot,
  } = useSchedules({ address, chainId, readiness });
  const position = useBorrowingPosition(
    chainId === TESTNET_CHAIN_ID ? address : undefined,
  );
  const payroll = usePayrollProjection({
    address,
    chainId,
    readiness,
    balances,
    schedules,
    scheduleRows,
    scheduleSnapshot,
    repaymentReserve,
  });
  const dayRate =
    payroll.rate === undefined ? undefined : payroll.rate * DAY_SECONDS;
  // Truncate the displayed daily rate to cents; the calculations retain bigint precision.
  const daily =
    dayRate === undefined
      ? ''
      : `${dayRate / 10n ** 18n}.${String((dayRate % 10n ** 18n) / 10n ** 16n).padStart(2, '0')}`;
  const different =
    position.data &&
    scheduleSnapshot &&
    (position.data.chainTime > scheduleSnapshot.chainTime
      ? position.data.chainTime - scheduleSnapshot.chainTime
      : scheduleSnapshot.chainTime - position.data.chainTime) > 120n;
  return (
    <section
      id="runway-planner"
      className="panel runway-planner"
      aria-label="Runway planner"
    >
      <span className="eyebrow">RUNWAY · BTC-BACKED PAYROLL</span>
      <h2>Plan your team's runway.</h2>
      <p className="hint">
        The planner uses your connected wallet's schedules and loan.
      </p>
      <label className="planner-reserve">
        Repayment reserve · MUSD
        <input
          inputMode="decimal"
          value={reserveText}
          onChange={(e) => setReserveText(e.target.value)}
        />
        <span className="hint">
          Planning assumption: retain this amount in your wallet rather than
          counting it toward renewed payments.
        </span>
      </label>
      {payroll.reason || !reserveValid ? (
        <div role="status" className="callout">
          {payroll.reason ??
            'Enter a nonnegative repayment reserve with up to 18 decimals.'}
          {schedules.hasNextPage && (
            <>
              {' '}
              <a href="/">Open Overview</a>
            </>
          )}
          {address && (
            <button
              className="text-button"
              onClick={() => {
                void readiness.refetch();
                void balances.refetch();
                void schedules.refetch();
              }}
            >
              Refresh planner
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="planner-grid">
            <div>
              <h3>Payroll covered until</h3>
              {payroll.covered !== undefined ? (
                <>
                  <p className="planner-headline">
                    Payroll covered until{' '}
                    <time dateTime={isoDate(payroll.covered)}>
                      {localDate(payroll.covered)}
                    </time>
                  </p>
                  <dl className="borrowing-values">
                    <div>
                      <dt>Payment rate</dt>
                      <dd>{daily} MUSD / day</dd>
                    </div>
                    <div>
                      <dt>All current streams funded through</dt>
                      <dd>{localDate(payroll.funded!)}</dd>
                    </div>
                    <div>
                      <dt>Wallet extension</dt>
                      <dd>
                        {String(
                          (payroll.covered - payroll.funded!) / DAY_SECONDS,
                        )}{' '}
                        days
                      </dd>
                    </div>
                  </dl>
                  <p className="hint">
                    Existing schedules are fully funded in escrow. Renewal
                    spending grows as each schedule ends.
                  </p>
                </>
              ) : (
                <p>No active payment schedules. Fund one to see your runway.</p>
              )}
              <p className="mono">
                Wallet MUSD: {formatUnits(payroll.walletMusd!, 18)}
              </p>
              <p className="hint">
                Usable wallet cash after repayment reserve:{' '}
                {formatUnits(payroll.usableWalletMusd!, 18)} MUSD.
                Already-funded escrow is committed to recipients.
              </p>
              <p className="hint">{projectionAssumptions}</p>
              {Boolean(payroll.future) && (
                <p className="hint">
                  {payroll.future} future-starting schedules excluded.
                </p>
              )}
            </div>
            <RunwayScenario
              key={address}
              position={position}
              rate={payroll.rate!}
            />
          </div>
          <p className="hint">
            {different ? 'Data from different blocks · ' : ''}Snapshot: payments
            block {String(scheduleSnapshot!.blockNumber)}
            {position.data
              ? ` · borrowing block ${position.data.blockNumber}`
              : ' · borrowing snapshot unavailable'}
            .
          </p>
        </>
      )}
    </section>
  );
}
