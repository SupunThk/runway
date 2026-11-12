import { formatUnits } from 'viem';
import { RATIO_SCALE } from '@runway/mezo';
import type { useLoanActions } from './hooks/useLoanActions';
const units = (value: bigint) => formatUnits(value, 18);
const percent = (value: bigint) =>
  formatUnits(value * 100n, 18).slice(0, 10) + '%';
export function LoanReview({
  loan,
}: {
  loan: ReturnType<typeof useLoanActions>;
}) {
  return (
    <>
      {loan.review ? (
        <div className="callout loan-review" aria-label="Review loan action">
          <h3>Review before signing</h3>
          <dl className="borrowing-values">
            <div>
              <dt>Wallet proceeds</dt>
              <dd>{units(loan.review.quote.proceeds)} MUSD</dd>
            </div>
            <div>
              <dt>Protocol fee added to debt</dt>
              <dd>{units(loan.review.quote.fee)} MUSD</dd>
            </div>
            <div>
              <dt>Opening gas reserve added to debt</dt>
              <dd>{units(loan.review.quote.reserveAdded)} MUSD</dd>
            </div>
            <div>
              <dt>Resulting debt estimate</dt>
              <dd>{units(loan.review.quote.debt)} MUSD</dd>
            </div>
            <div>
              <dt>Repayment</dt>
              <dd>{units(loan.review.quote.repayment)} MUSD</dd>
            </div>
            <div>
              <dt>Resulting BTC collateral</dt>
              <dd>{units(loan.review.quote.collateral)} BTC</dd>
            </div>
            <div>
              <dt>Resulting collateral ratio</dt>
              <dd>{percent(loan.review.quote.ratio ?? RATIO_SCALE)}</dd>
            </div>
            <div>
              <dt>BTC gas budget retained</dt>
              <dd>{units(loan.review.gasBudget)} BTC</dd>
            </div>
          </dl>
          <p>
            The pre-sign check allows debt up to {units(loan.review.maxDebt)}{' '}
            MUSD to accommodate accrued interest. This limit is checked in
            Runway, not enforced by the protocol transaction. Mode, fees and
            eligibility are rechecked before the wallet prompt.
          </p>
          <p>
            Borrowing creates debt and liquidation risk. Funding a payment
            remains a separate transaction. If funding fails after borrowing,
            the loan remains and MUSD stays in your wallet.
          </p>
          <button
            className="button"
            disabled={
              loan.busy ||
              loan.reviewStale ||
              Boolean(loan.pending) ||
              Boolean(loan.storageError) ||
              Boolean(loan.query.error) ||
              loan.stale
            }
            onClick={() => void loan.submit()}
          >
            Confirm loan action in wallet
          </button>
          <button
            className="button secondary"
            disabled={loan.busy}
            onClick={loan.invalidateReview}
          >
            Change loan terms
          </button>
          {loan.reviewStale ? (
            <p role="alert">This review expired. Refresh and review again.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
