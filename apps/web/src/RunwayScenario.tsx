import { useState } from 'react';
import {
  monthsCovered,
  protocolBorrowingScenario,
  requiredForMonths,
} from '@runway/mezo';
import { formatUnits, parseUnits } from 'viem';
import type { useBorrowingPosition } from './hooks/useBorrowingPosition';
import { useProtocolSnapshot } from './hooks/useProtocolSnapshot';
type Position = ReturnType<typeof useBorrowingPosition>;
export function RunwayScenario({
  position,
  rate,
}: {
  position: Position;
  rate: bigint;
}) {
  const [months, setMonths] = useState('3'),
    [drop, setDrop] = useState(20),
    [target, setTarget] = useState(200),
    [collateral, setCollateral] = useState('0');
  const { query, data, stale, price } = position;
  const protocol = useProtocolSnapshot(
    Boolean(data?.active && price && !stale && !query.error),
  );
  const presets = [150, 200, 250],
    enabled = presets.filter(
      (r) =>
        data?.active && BigInt(r) * 10n ** 16n > data.minimumRatio + 10n ** 17n,
    );
  const selected = enabled.includes(target) ? target : enabled[0];
  let reason: string | undefined;
  if (query.isPending) reason = 'Reading borrowing position…';
  else if (query.error)
    reason = 'Loan health unknown: ' + query.error.message.split('\n')[0];
  else if (!data) reason = 'Loan health unknown: borrowing data unavailable.';
  else if (!data.active)
    reason = [
      'No Mezo borrowing position found for this account.',
      '',
      'Position closed by its owner.',
      'Position closed by liquidation.',
      'Position closed by redemption.',
    ][data.status];
  else if (!price)
    reason =
      'Loan health unknown: ' +
      (stale
        ? 'the snapshot is stale.'
        : (data.priceError ?? 'protocol price unavailable.'));
  else if (selected === undefined)
    reason =
      'No target collateral ratio preset meets the protocol threshold plus 10 percentage points.';
  else if (protocol.isPending)
    reason = 'Checking protocol fees, mode and borrowing limits…';
  else if (protocol.error)
    reason =
      'Protocol-aware planning unavailable: ' +
      protocol.error.message.split('\n')[0];
  else if (
    !protocol.data ||
    Date.now() / 1000 - Number(protocol.data.chainTime) > 60 ||
    Date.now() / 1000 - Number(protocol.data.chainTime) < -30
  )
    reason = 'Protocol-aware planning unavailable: the snapshot is stale.';
  const validMonths =
    /^\d+$/.test(months) && Number(months) >= 1 && Number(months) <= 24;
  const needed =
    rate > 0n && validMonths
      ? requiredForMonths(rate, Number(months))
      : undefined;
  let scenario: ReturnType<typeof protocolBorrowingScenario> | undefined,
    inputError: string | undefined;
  if (!reason && protocol.data && selected !== undefined) {
    try {
      if (!/^\d{1,60}(\.\d{1,18})?$/.test(collateral))
        throw new Error(
          'Enter nonnegative BTC collateral with up to 18 decimals.',
        );
      scenario = protocolBorrowingScenario(
        protocol.data,
        drop,
        BigInt(selected) * 10n ** 16n,
        parseUnits(collateral, 18),
        needed,
      );
    } catch (error) {
      inputError =
        error instanceof Error ? error.message : 'Invalid scenario inputs.';
    }
  }
  return (
    <div>
      <h3>Can you fund another N months?</h3>
      <p className="hint">
        Additional borrowing alone funds current streams for N more 30-day
        months. Hypothetical proceeds do not extend your current coverage date.
      </p>
      {reason ? (
        <p role="status">{reason}</p>
      ) : (
        <>
          <div className="planner-controls">
            <label>
              Months
              <input
                type="number"
                min="1"
                max="24"
                step="1"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </label>
            <label>
              BTC price drop · {drop}%
              <input
                aria-label="Planner BTC price drop"
                type="range"
                min="0"
                max="100"
                step="1"
                value={drop}
                onChange={(e) => setDrop(Number(e.target.value))}
              />
            </label>
            <div className="actions">
              {[0, 10, 20, 30, 50].map((v) => (
                <button
                  key={v}
                  className="button secondary"
                  type="button"
                  aria-pressed={drop === v}
                  onClick={() => setDrop(v)}
                >
                  {v}%
                </button>
              ))}
            </div>
            <label>
              Target collateral ratio
              <select
                value={selected}
                onChange={(e) => setTarget(Number(e.target.value))}
              >
                {presets.map((v) => (
                  <option key={v} value={v} disabled={!enabled.includes(v)}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
            <label>
              Additional BTC collateral · hypothetical
              <input
                inputMode="decimal"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
              />
            </label>
          </div>
          {!validMonths ? (
            <p role="alert">Choose 1–24 whole planning months.</p>
          ) : null}
          {inputError ? <p role="alert">{inputError}</p> : null}
          {scenario ? (
            <>
              <dl className="borrowing-values">
                {needed !== undefined ? (
                  <div>
                    <dt>Needed</dt>
                    <dd>{formatUnits(needed, 18)} MUSD</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Additional borrowing capacity at this scenario</dt>
                  <dd>{formatUnits(scenario.proceeds, 18)} MUSD</dd>
                </div>
                <div>
                  <dt>Scenario system mode</dt>
                  <dd>{scenario.recovery ? 'Recovery Mode' : 'Normal mode'}</dd>
                </div>
                {scenario.quote ? (
                  <>
                    <div>
                      <dt>Fee added to debt</dt>
                      <dd>{formatUnits(scenario.quote.fee, 18)} MUSD</dd>
                    </div>
                    <div>
                      <dt>Resulting debt for the requested months</dt>
                      <dd>{formatUnits(scenario.quote.debt, 18)} MUSD</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {needed !== undefined ? (
                <p
                  role="status"
                  className={
                    scenario.quote?.eligible ? 'hint' : 'callout warning'
                  }
                >
                  {scenario.quote?.eligible
                    ? 'Covered in this scenario: ' +
                      formatUnits(needed, 18) +
                      ' MUSD passes the snapshot fee, mode, target and capacity checks.'
                    : 'Not covered in this scenario: ' +
                      formatUnits(
                        needed > scenario.proceeds
                          ? needed - scenario.proceeds
                          : 0n,
                        18,
                      ) +
                      ' MUSD short. ' +
                      (scenario.quote?.reasons.join(' ') ??
                        scenario.reasons.join(' ')) +
                      ' Additional eligible capacity covers about ' +
                      monthsCovered(scenario.proceeds, rate) +
                      ' months.'}
                </p>
              ) : null}
              {!scenario.proceeds && scenario.reasons.length ? (
                <p className="hint">{scenario.reasons.join(' ')}</p>
              ) : null}
              <p className="hint">
                Verified protocol snapshot block{' '}
                {String(protocol.data!.blockNumber)}. Minimum net debt{' '}
                {formatUnits(protocol.data!.minNetDebt, 18)} MUSD; opening
                reserve {formatUnits(protocol.data!.gasReserve, 18)} MUSD
                applies only to a new trove. Stored trove capacity is enforced
                independently of collateral value.
              </p>
            </>
          ) : null}
        </>
      )}
      <details>
        <summary>Planning assumptions and limits</summary>
        <p className="hint">
          Uses the loan review engine for issuance fees, fee exemptions, minimum
          debt, reserve, system mode and stored issuance capacity. Price
          scenarios hold other snapshot inputs fixed. Future interest, future
          revenue and BTC gas spending are not predicted. This is a planning
          estimate, not an executable quote; fresh reads and simulation are
          required before signing. MUSD uses the protocol's USD debt-accounting
          assumption.
        </p>
      </details>
      <div className="actions">
        <a className="button" href="/borrowing">
          Review borrowing controls
        </a>
        <a
          href="https://testnet.mezo.org/borrow"
          target="_blank"
          rel="noreferrer"
        >
          Borrow more MUSD in Mezo ↗
        </a>
        <a href="/?create=1">Fund a schedule →</a>
      </div>
    </div>
  );
}
