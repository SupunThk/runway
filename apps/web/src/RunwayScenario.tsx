import { useState } from 'react';
import {
  borrowingHeadroom,
  monthsCovered,
  requiredForMonths,
} from '@runway/mezo';
import { formatUnits } from 'viem';
import type { useBorrowingPosition } from './hooks/useBorrowingPosition';

type Position = ReturnType<typeof useBorrowingPosition>;
export function RunwayScenario({
  position,
  rate,
}: {
  position: Position;
  rate: bigint;
}) {
  const [months, setMonths] = useState('3');
  const [drop, setDrop] = useState(20);
  const [target, setTarget] = useState(200);
  const { query, data, stale, price } = position;
  const presets = [150, 200, 250];
  const enabled = presets.filter(
    (r) =>
      data?.active && BigInt(r) * 10n ** 16n > data.minimumRatio + 10n ** 17n,
  );
  const selected = enabled.includes(target) ? target : enabled[0];
  let reason: string | undefined;
  if (query.isPending) reason = 'Reading borrowing position…';
  else if (query.error)
    reason = `Loan health unknown: ${query.error.message.split('\n')[0]}`;
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
    reason = `Loan health unknown: ${stale ? 'the snapshot is stale.' : (data.priceError ?? 'protocol price unavailable.')}`;
  else if (selected === undefined)
    reason =
      'No target collateral ratio preset meets the protocol threshold plus 10 percentage points.';
  const validMonths =
    /^\d+$/.test(months) &&
    Number.isInteger(Number(months)) &&
    Number(months) >= 1 &&
    Number(months) <= 24;
  const scenario =
    !reason && data?.active && price && selected !== undefined
      ? borrowingHeadroom({
          collateral: data.collateral,
          debt: data.debt,
          price: price.value,
          dropPercent: drop,
          targetRatio: BigInt(selected) * 10n ** 16n,
          minimumRatio: data.minimumRatio,
        })
      : undefined;
  const needed =
    rate > 0n && validMonths
      ? requiredForMonths(rate, Number(months))
      : undefined;
  return (
    <div>
      <h3>Can you fund another N months?</h3>
      <p className="hint">
        Additional borrowing alone funds all current streams for N more 30-day
        months. This scenario does not extend the coverage date above.
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
              {[0, 10, 20, 30, 50].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="button secondary"
                  aria-pressed={drop === value}
                  onClick={() => setDrop(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
            <label>
              Target collateral ratio
              <select
                value={selected}
                onChange={(e) => setTarget(Number(e.target.value))}
              >
                {presets.map((value) => (
                  <option
                    key={value}
                    value={value}
                    disabled={!enabled.includes(value)}
                  >
                    {value}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!validMonths && (
            <p role="alert">Choose 1–24 whole planning months.</p>
          )}
          <dl className="borrowing-values">
            {needed !== undefined && (
              <div>
                <dt>Needed</dt>
                <dd>{formatUnits(needed, 18)} MUSD</dd>
              </div>
            )}
            <div>
              <dt>Additional borrowing capacity at this scenario</dt>
              <dd>{formatUnits(scenario!.headroom, 18)} MUSD</dd>
            </div>
          </dl>
          {needed !== undefined && (
            <p
              role="status"
              className={
                scenario!.headroom >= needed ? 'hint' : 'callout warning'
              }
            >
              {scenario!.headroom >= needed
                ? `Covered in this scenario: borrowing ≈ ${formatUnits(needed, 18)} MUSD keeps your ratio at or above ${selected}% after a ${drop}% BTC drop.`
                : `Not covered in this scenario: about ${formatUnits(needed - scenario!.headroom, 18)} MUSD short. Additional capacity covers about ${monthsCovered(scenario!.headroom, rate)} months.`}
            </p>
          )}
        </>
      )}
      <p className="hint">
        Estimate only, not a borrowing quote. Excludes Mezo borrowing fees,
        minimum debt, gas compensation on new debt, future interest and
        system-wide recovery conditions. Treats 1 MUSD as 1 USD, as protocol
        debt accounting does.
      </p>
      <div className="actions">
        <a
          className="button"
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
