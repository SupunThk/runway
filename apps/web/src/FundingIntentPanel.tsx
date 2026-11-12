import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  erc20Abi,
  formatUnits,
  TransactionReceiptNotFoundError,
  TransactionNotFoundError,
} from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { explorer, musdAddress } from './config';
import {
  fundingDestination,
  inspectIntentEvidence,
  saveIntentEvidence,
  type FundingIntent,
  type IntentStep,
} from './fundingIntent';

export function FundingIntentPanel({ intent }: { intent: FundingIntent }) {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const query = useQuery({
    queryKey: [
      'funding-plan-status',
      intent.id,
      ...Object.values(intent.evidence).map((e) => e.hash),
    ],
    enabled: Boolean(client && musdAddress),
    retry: false,
    refetchInterval: 10_000,
    queryFn: async () => {
      const block = await client!.getBlock();
      const age = Date.now() / 1000 - Number(block.timestamp);
      if (age > 120 || age < -30)
        throw new Error('Chain data is stale. Refresh before continuing.');
      const balance = await client!.readContract({
        address: musdAddress!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [intent.owner],
        blockNumber: block.number,
      });
      const evidence: Partial<
        Record<
          IntentStep,
          {
            state: 'submitted' | 'confirmed' | 'reverted';
            blockNumber?: string;
            scheduleId?: string;
          }
        >
      > = {};
      for (const step of ['loan', 'approval', 'funding'] as const) {
        const saved = intent.evidence[step];
        if (!saved) continue;
        try {
          evidence[step] = await inspectIntentEvidence(client!, intent, saved);
        } catch (error) {
          if (
            error instanceof TransactionReceiptNotFoundError ||
            error instanceof TransactionNotFoundError
          )
            evidence[step] = { state: 'submitted' };
          else throw error;
        }
      }
      return { evidence, balance, block: block.number };
    },
  });
  useEffect(() => {
    if (!query.data || query.error) return;
    for (const step of ['loan', 'approval', 'funding'] as const) {
      const result = query.data.evidence[step],
        saved = intent.evidence[step];
      if (
        result &&
        saved &&
        (result.state !== saved.state ||
          result.blockNumber !== saved.blockNumber)
      ) {
        try {
          saveIntentEvidence(intent.owner, intent.id, step, {
            ...saved,
            ...result,
            blockNumber: result.blockNumber,
            scheduleId: result.scheduleId,
          });
        } catch {
          /* The hash remains visible; storage errors cannot authorize another transaction. */
        }
      }
    }
  }, [query.data, query.error, intent]);
  const states = !query.error ? query.data?.evidence : undefined;
  const funded = states?.funding?.state === 'confirmed';
  const borrowed = states?.loan?.state === 'confirmed';
  const missing =
    query.data &&
    !query.error &&
    query.data.balance < BigInt(intent.amountBaseUnits)
      ? BigInt(intent.amountBaseUnits) - query.data.balance
      : 0n;
  const unresolved = Object.keys(intent.evidence).some(
    (step) => !states || states[step as IntentStep]?.state === 'submitted',
  );
  return (
    <section className="panel funding-plan" aria-label="Saved funding plan">
      <span className="eyebrow">PAYMENT PLAN</span>
      <h2>
        {funded
          ? intent.paymentType === 'schedule'
            ? 'Payment funding confirmed'
            : 'Payment confirmed'
          : borrowed
            ? 'Borrowed; payment not yet funded'
            : 'Your saved funding plan'}
      </h2>
      <p>
        <strong>{formatUnits(BigInt(intent.amountBaseUnits), 18)} MUSD</strong>{' '}
        to <span className="mono">{intent.recipient}</span>.
      </p>
      <ol className="transaction-steps" aria-label="Payment progress">
        <li>Payment terms saved</li>
        <li>
          {intent.evidence.loan
            ? `Borrowing: ${states?.loan?.state ?? 'checking'}`
            : 'Borrowing: optional'}
        </li>
        {intent.paymentType === 'schedule' ? (
          <li>
            Allowance: {states?.approval?.state ?? 'checked before funding'}
          </li>
        ) : null}
        <li>
          Payment:{' '}
          {states?.funding?.state ??
            (intent.evidence.funding ? 'checking' : 'not submitted')}
        </li>
      </ol>
      {query.error ? (
        <p className="callout warning" role="alert">
          Could not revalidate this plan: {query.error.message}. Keep the saved
          hashes and check again; do not repeat a transaction.
        </p>
      ) : null}
      {unresolved ? (
        <p role="status">
          A saved transaction is unresolved. Check its receipt and acknowledge
          its result before continuing. Nothing is resubmitted automatically.
        </p>
      ) : null}
      {query.data && !query.error ? (
        <p className="hint">
          Wallet MUSD: {formatUnits(query.data.balance, 18)}. Funding gap:{' '}
          {formatUnits(missing, 18)} MUSD. Balance block{' '}
          {String(query.data.block)}. Escrow commitments are separate from
          wallet cash.
        </p>
      ) : null}
      <div className="actions">
        <button
          className="button secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Check funding plan
        </button>
        {!funded && !unresolved && !query.error && query.data ? (
          <a className="button" href={fundingDestination(intent)}>
            Continue payment funding
          </a>
        ) : null}
        {funded && states?.funding?.scheduleId ? (
          <a
            className="button"
            href={`/schedules/${states.funding.scheduleId}`}
          >
            Open recipient payment link
          </a>
        ) : null}
        {!intent.evidence.loan &&
        !intent.evidence.funding &&
        missing > 0n &&
        !query.error ? (
          <a
            className="button secondary"
            href={`/borrowing?intent=${intent.id}&borrowAmount=${formatUnits(missing, 18)}`}
          >
            Review borrowing for the funding gap
          </a>
        ) : null}
      </div>
      <details>
        <summary>Saved transaction receipts and reviewed debt</summary>
        {Object.entries(intent.evidence).map(([step, e]) => (
          <p key={step}>
            {step}:{' '}
            <a
              href={`${explorer}/tx/${e.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {e.hash}
            </a>
            {states?.[step as IntentStep]?.blockNumber
              ? ` · block ${states[step as IntentStep]!.blockNumber}`
              : ''}
          </p>
        ))}
        {intent.reviewedLoan ? (
          <dl className="borrowing-values">
            <div>
              <dt>Reviewed wallet proceeds</dt>
              <dd>
                {formatUnits(BigInt(intent.reviewedLoan.proceeds), 18)} MUSD
              </dd>
            </div>
            <div>
              <dt>Debt before / reviewed debt after</dt>
              <dd>
                {formatUnits(BigInt(intent.reviewedLoan.debtBefore), 18)} /{' '}
                {formatUnits(BigInt(intent.reviewedLoan.debtAfter), 18)} MUSD
              </dd>
            </div>
            <div>
              <dt>Reviewed fee</dt>
              <dd>{formatUnits(BigInt(intent.reviewedLoan.fee), 18)} MUSD</dd>
            </div>
          </dl>
        ) : null}
        {intent.confirmedLoan ? (
          <p>
            Observed debt after confirmation:{' '}
            {formatUnits(BigInt(intent.confirmedLoan.debt), 18)} MUSD. Wallet
            MUSD: {formatUnits(BigInt(intent.confirmedLoan.walletMusd), 18)}.
            Source block {intent.confirmedLoan.sourceBlock} ·{' '}
            {intent.confirmedLoan.observedAt}. Later interest and spending can
            change these values.
          </p>
        ) : null}
      </details>
      <p className="hint">
        Saved in this browser for this wallet and testnet deployment. Debt
        review values are estimates; receipts confirm execution, and current
        balances are read again before funding. Borrowing and funding remain
        separate transactions. Clearing browser storage loses this recovery
        record.
      </p>
    </section>
  );
}
