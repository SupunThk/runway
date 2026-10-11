import { useState } from 'react';
import { formatUnits } from 'viem';
import { borrowingStress } from '@runway/mezo';

const presets = [0, 10, 20, 30, 50];
const percent = (ratio: bigint) => `${formatUnits(ratio / 10n ** 12n, 4)}%`;
// Prices are rounded up to cents so the displayed threshold is never understated.
const dollars = (amount: bigint) =>
  `${formatUnits((amount + 10n ** 16n - 1n) / 10n ** 16n, 2)} USD`;
const status = (scenario: ReturnType<typeof borrowingStress>) =>
  scenario.belowThreshold
    ? 'Below threshold'
    : scenario.atThreshold
      ? 'At threshold'
      : 'Above threshold';

export function BorrowingStress({
  collateral,
  debt,
  minimumRatio,
  price,
}: {
  collateral: bigint;
  debt: bigint;
  minimumRatio: bigint;
  price: bigint;
}) {
  const [drop, setDrop] = useState(20);
  const calculate = (value: number) =>
    borrowingStress(collateral, debt, minimumRatio, price, value);
  const scenario = calculate(drop);
  return (
    <section
      className="borrowing-stress"
      aria-label="BTC price stress simulator"
    >
      <h3>BTC price stress simulator</h3>
      <p className="hint">
        Hypothetical price changes using the displayed borrowing snapshot.
        Collateral and total debt stay fixed, including accrued interest and the
        protocol gas reserve. Future interest, repayments, redistribution and
        system-wide liquidation conditions are not modelled.
      </p>
      <label>
        BTC price drop: {drop}%
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={drop}
          aria-label="BTC price drop"
          aria-valuetext={`${drop}% drop`}
          onChange={(event) => setDrop(Number(event.target.value))}
        />
      </label>
      <div className="stress-result" role="status" aria-live="polite">
        <dl className="borrowing-values">
          <div>
            <dt>Hypothetical BTC price</dt>
            <dd>{dollars(scenario.price)}</dd>
          </div>
          <div>
            <dt>Hypothetical collateral ratio</dt>
            <dd>{percent(scenario.ratio)}</dd>
          </div>
        </dl>
        <p
          className={
            scenario.belowThreshold || scenario.atThreshold
              ? 'callout warning'
              : 'hint'
          }
        >
          {status(scenario)} in this scenario ({percent(minimumRatio)}).
        </p>
      </div>
      <p>
        Threshold BTC price: <strong>{dollars(scenario.thresholdPrice)}</strong>{' '}
        (rounded up to cents). Estimated BTC price corresponding to a{' '}
        {percent(minimumRatio)} snapshot ratio. This is a price-only estimate,
        not a prediction of when liquidation will occur.
      </p>
      <div className="stress-table-scroll">
        <table>
          <caption>
            Price-drop scenarios · fixed snapshot collateral and debt
          </caption>
          <thead>
            <tr>
              <th scope="col">BTC drop</th>
              <th scope="col">BTC price</th>
              <th scope="col">Ratio</th>
              <th scope="col">Threshold</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((value) => {
              const row = calculate(value);
              return (
                <tr key={value}>
                  <th scope="row">{value}%</th>
                  <td>{dollars(row.price)}</td>
                  <td>{percent(row.ratio)}</td>
                  <td>{status(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        These scenarios do not change your loan or submit a transaction. Above
        threshold does not guarantee protection from liquidation or redemption.
      </p>
    </section>
  );
}
