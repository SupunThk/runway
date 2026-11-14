import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  collateralRatio,
  quoteHeadroom,
  TESTNET_CHAIN_ID,
  type LoanInput,
  type LoanOperation,
} from '@runway/mezo';
import { useAccount } from 'wagmi';
import { useLoanActions } from './hooks/useLoanActions';
import { LoanReview } from './LoanReview';
import { LoanTransaction } from './LoanTransaction';

const units = (value: bigint) => formatUnits(value, 18);
const percent = (value: bigint) =>
  `${formatUnits(value * 100n, 18).slice(0, 10)}%`;
function tokenInput(value: string) {
  if (!/^\d{1,60}(\.\d{1,18})?$/.test(value))
    throw new Error('Use a nonnegative amount with at most 18 decimal places.');
  return parseUnits(value, 18);
}
export function BorrowingActions() {
  const [open, setOpen] = useState(false);
  const { address } = useAccount();
  return (
    <section className="panel loan-actions" aria-label="Manage Mezo loan">
      <div className="section-heading">
        <h2>Manage your Mezo loan</h2>
        <span className="badge">TESTNET</span>
      </div>
      <p>
        Review BTC collateral and MUSD debt changes, then confirm each
        transaction in your wallet.
      </p>
      <button
        className="button secondary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide loan controls' : 'Open loan controls'}
      </button>
      {open ? <LoanControls key={address ?? 'disconnected'} /> : null}
    </section>
  );
}
function LoanControls() {
  const loan = useLoanActions();
  const params = new URLSearchParams(location.search);
  const [operation, setOperation] = useState<LoanOperation>(
    params.get('loanAction') === 'repay' ? 'repay' : 'borrow',
  );
  const [amount, setAmount] = useState(
    params.get('repayAmount') ?? params.get('borrowAmount') ?? '',
  );
  const [collateral, setCollateral] = useState('0');
  const [target, setTarget] = useState('200');
  const [error, setError] = useState('');
  const snapshot = loan.query.data;
  const selected =
    snapshot && !snapshot.active && operation === 'borrow' ? 'open' : operation;
  let capacity: ReturnType<typeof quoteHeadroom> | undefined;
  try {
    if (
      snapshot &&
      !loan.stale &&
      !loan.query.error &&
      (selected === 'open' || selected === 'borrow')
    )
      capacity = quoteHeadroom(
        snapshot,
        tokenInput(collateral),
        BigInt(target) * 10n ** 16n,
      );
  } catch {
    /* Invalid in-progress form input has no capacity estimate. */
  }
  if (!loan.address)
    return (
      <p className="callout">Connect your wallet to manage your Mezo loan.</p>
    );
  if (loan.chainId !== TESTNET_CHAIN_ID)
    return (
      <p className="callout warning">
        Switch your wallet to Mezo testnet to manage your loan.
      </p>
    );
  function change(action: () => void) {
    loan.invalidateReview();
    setError('');
    action();
  }
  async function review() {
    try {
      setError('');
      const input: LoanInput = {
        operation: selected,
        amount: selected === 'add-collateral' ? 0n : tokenInput(amount),
        collateralAdded: selected === 'repay' ? 0n : tokenInput(collateral),
        targetRatio: BigInt(target) * 10n ** 16n,
      };
      await loan.prepare(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid loan terms.');
    }
  }
  return (
    <div className="loan-controls">
      <LoanTransaction loan={loan} />
      {loan.storageError ? (
        <p className="callout warning" role="alert">
          {loan.storageError}
          {!loan.pending ? (
            <button className="text-button" onClick={loan.removeTracking}>
              Remove damaged loan tracking
            </button>
          ) : null}
        </p>
      ) : null}
      {loan.query.isPending ? (
        <p role="status">Verifying Mezo write contracts and loan parameters…</p>
      ) : null}
      {loan.query.error || loan.stale ? (
        <p className="callout warning" role="alert">
          Loan quote unavailable:{' '}
          {loan.stale
            ? 'the snapshot is stale.'
            : loan.query.error?.message.split('\n')[0]}{' '}
          <button
            className="text-button"
            onClick={() => {
              loan.invalidateReview();
              void loan.query.refetch();
            }}
          >
            Refresh loan quote
          </button>
        </p>
      ) : null}
      {snapshot && !loan.query.error && !loan.stale ? (
        <>
          <dl className="borrowing-values">
            <div>
              <dt>Protocol mode</dt>
              <dd>
                {collateralRatio(
                  snapshot.systemCollateral,
                  snapshot.systemDebt,
                  snapshot.price,
                ) < snapshot.criticalRatio
                  ? 'Recovery Mode'
                  : 'Normal Mode'}
              </dd>
            </div>
            <div>
              <dt>Current debt</dt>
              <dd>{units(snapshot.debt)} MUSD</dd>
            </div>
            <div>
              <dt>Minimum net debt</dt>
              <dd>{units(snapshot.minNetDebt)} MUSD</dd>
            </div>
            <div>
              <dt>Borrowing fee</dt>
              <dd>
                {snapshot.feeExempt
                  ? 'Account exempt'
                  : percent(snapshot.feeRate)}{' '}
                · waived in Recovery Mode
              </dd>
            </div>
          </dl>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void review();
            }}
          >
            <fieldset
              disabled={
                loan.busy || Boolean(loan.pending) || Boolean(loan.storageError)
              }
            >
              <label>
                Loan action
                <select
                  value={selected}
                  onChange={(e) =>
                    change(() => setOperation(e.target.value as LoanOperation))
                  }
                >
                  <option value={snapshot.active ? 'borrow' : 'open'}>
                    {snapshot.active ? 'Borrow more MUSD' : 'Open a Mezo trove'}
                  </option>
                  {snapshot.active ? (
                    <>
                      <option value="add-collateral">Add BTC collateral</option>
                      <option value="repay">Repay MUSD</option>
                    </>
                  ) : null}
                </select>
              </label>
              {selected !== 'add-collateral' ? (
                <label>
                  {selected === 'repay'
                    ? 'Repay amount · MUSD'
                    : 'Receive in wallet · MUSD'}
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => change(() => setAmount(e.target.value))}
                    required
                  />
                </label>
              ) : null}
              {selected !== 'repay' ? (
                <label>
                  BTC collateral to add
                  <input
                    inputMode="decimal"
                    value={collateral}
                    onChange={(e) =>
                      change(() => setCollateral(e.target.value))
                    }
                    required
                  />
                </label>
              ) : null}
              {selected === 'open' || selected === 'borrow' ? (
                <label>
                  Target collateral ratio
                  <select
                    value={target}
                    onChange={(e) => change(() => setTarget(e.target.value))}
                  >
                    <option value="150">150%</option>
                    <option value="200">200%</option>
                    <option value="250">250%</option>
                    <option value="300">300%</option>
                  </select>
                </label>
              ) : null}
              {capacity ? (
                <p className="hint">
                  Maximum additional wallet proceeds at this snapshot:{' '}
                  {units(capacity.proceeds)} MUSD. Includes fees, system-mode
                  constraints and the stored trove limit.
                </p>
              ) : null}
              <button
                className="button"
                type="submit"
                disabled={Boolean(loan.review)}
              >
                {loan.busy
                  ? 'Checking loan terms…'
                  : 'Review and simulate loan action'}
              </button>
            </fieldset>
          </form>
          <p className="hint">
            Source block {String(snapshot.blockNumber)} ·{' '}
            {new Date(Number(snapshot.chainTime) * 1000).toISOString()} ·{' '}
            {snapshot.active
              ? `Position rate ${snapshot.rate / 100}% APR`
              : `Opening rate ${snapshot.openingRate / 100}% APR`}
            . Interest continues to accrue.
          </p>
        </>
      ) : null}
      <LoanReview loan={loan} />
      {error || loan.notice ? (
        <p className="callout warning" role="alert">
          {error || loan.notice}
        </p>
      ) : null}
      <p className="hint">
        Testnet prototype. No automatic borrowing, repayments or claims. Full
        trove closure is not included in this release.
      </p>
    </div>
  );
}
