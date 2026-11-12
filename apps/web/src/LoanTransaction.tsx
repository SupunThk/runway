import { formatUnits } from 'viem';
import type { useLoanActions } from './hooks/useLoanActions';
import { explorer } from './config';
const units = (value: bigint) => formatUnits(value, 18);
export function LoanTransaction({
  loan,
}: {
  loan: ReturnType<typeof useLoanActions>;
}) {
  const terminal =
    loan.status.data?.state === 'confirmed' ||
    loan.status.data?.state === 'reverted';
  return (
    <>
      {loan.pending ? (
        <div className="callout" aria-label="Saved loan transaction">
          <h3>Saved loan transaction</h3>
          <p className="mono">{loan.pending.hash}</p>
          <a
            href={`${explorer}/tx/${loan.pending.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View loan transaction
          </a>
          <p role="status">
            {loan.status.error
              ? 'Transaction status unavailable. Check again before sending anything.'
              : loan.status.data?.state === 'confirmed'
                ? 'Loan transaction confirmed. Refresh your position before funding a payment.'
                : loan.status.data?.state === 'reverted'
                  ? 'Loan transaction reverted. No loan change was applied.'
                  : loan.status.data?.state === 'mismatch'
                    ? 'Saved details do not match the transaction. Review it in your wallet and explorer.'
                    : 'Waiting for receipt and 12 block confirmations. No transaction will be resubmitted.'}
          </p>
          <button
            className="button secondary"
            onClick={() => void loan.status.refetch()}
          >
            Check loan transaction
          </button>
          {terminal ? (
            <button
              className="button"
              onClick={() => void loan.acknowledge(loan.pending!.hash)}
            >
              Acknowledge loan result
            </button>
          ) : null}
          {!terminal ? (
            <p>
              <button
                className="text-button"
                disabled={loan.busy}
                onClick={loan.removeTracking}
              >
                Remove local loan tracking
              </button>
            </p>
          ) : null}
          {loan.status.data?.state === 'confirmed' &&
          (loan.pending.operation === 'borrow' ||
            loan.pending.operation === 'open') ? (
            <p>
              Borrowed MUSD is in your wallet. Funding a contractor is a
              separate transaction.{' '}
              <a
                href={
                  loan.pending.fundingIntentId
                    ? `/?create=1&intent=${encodeURIComponent(loan.pending.fundingIntentId)}`
                    : `/?create=1&amount=${encodeURIComponent(units(BigInt(loan.pending.amount)))}`
                }
                onClick={(event) => {
                  event.preventDefault();
                  const destination = event.currentTarget.href;
                  void loan.acknowledge(loan.pending!.hash).then((cleared) => {
                    if (cleared) window.location.assign(destination);
                  });
                }}
              >
                {loan.pending.fundingIntentId
                  ? 'Continue funding this payment'
                  : 'Prepare a payment schedule'}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
