import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { parseEventLogs, TransactionReceiptNotFoundError } from 'viem';
import { paymentsAbi, TESTNET_CHAIN_ID } from '@runway/mezo';
import { explorer } from './config';
import type { PendingTransaction } from './pending';

export function PendingTransactionPanel({
  pending,
  busy,
  ready,
  onResolved,
}: {
  pending: PendingTransaction;
  busy: boolean;
  ready: boolean;
  onResolved: () => void;
}) {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const status = useQuery({
    queryKey: [
      'pending-receipt',
      pending.hash,
      pending.data,
      pending.sender,
      pending.target,
    ],
    enabled: Boolean(client && ready && !busy),
    queryFn: async () => {
      let receipt;
      try {
        receipt = await client!.getTransactionReceipt({ hash: pending.hash });
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError)
          return { state: 'unconfirmed' as const };
        throw error;
      }
      const tx = await client!.getTransaction({ hash: pending.hash });
      const matches =
        tx.from.toLowerCase() === pending.sender.toLowerCase() &&
        tx.to?.toLowerCase() === pending.target.toLowerCase() &&
        tx.input.toLowerCase() === pending.data.toLowerCase() &&
        tx.value === 0n;
      const created =
        matches && receipt.status === 'success' && pending.action === 'Funding'
          ? parseEventLogs({
              abi: paymentsAbi,
              eventName: 'ScheduleCreated',
              logs: receipt.logs.filter(
                (log) =>
                  log.address.toLowerCase() === pending.contract.toLowerCase(),
              ),
            })[0]?.args.scheduleId
          : undefined;
      return {
        state: !matches ? ('replacement' as const) : receipt.status,
        created,
      };
    },
    retry: false,
    refetchInterval: (query) =>
      !query.state.data || query.state.data.state === 'unconfirmed'
        ? 10000
        : false,
    staleTime: 0,
  });
  const terminal = status.data && status.data.state !== 'unconfirmed';
  return (
    <section className="callout" aria-label="Saved transaction">
      <strong>{pending.action} transaction</strong>
      <p>
        Submitted by {pending.sender}
        {pending.scheduleId ? ` for schedule #${pending.scheduleId}` : ''}.
      </p>
      <p>
        {busy
          ? 'Waiting for confirmation…'
          : !ready
            ? 'Waiting for testnet connection before checking the saved transaction.'
            : status.isPending
              ? 'Checking saved transaction…'
              : status.error
                ? 'Could not check confirmation. Your transaction remains saved; retry the status check.'
                : status.data?.state === 'success'
                  ? pending.action === 'Approval'
                    ? 'Approval confirmed. No schedule was funded by this approval. Continue from the funding form with a fresh start time.'
                    : `${pending.action} confirmed.`
                  : status.data?.state === 'reverted'
                    ? 'Transaction reverted. Refresh the schedule before deciding whether to retry.'
                    : status.data?.state === 'replacement'
                      ? 'The confirmed transaction differs from the saved action. Review it in the explorer; the original action is not confirmed here.'
                      : 'No receipt found yet. This can mean pending, dropped, or replaced. Check your wallet and explorer before retrying; nothing will be resubmitted automatically.'}
      </p>
      <p>
        <a
          href={`${explorer}/tx/${pending.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View saved transaction ↗
        </a>
      </p>
      <p className="hint">{pending.hash}</p>
      {status.data?.created && (
        <a href={`/schedules/${status.data.created}`}>
          Open funded schedule #{String(status.data.created)}
        </a>
      )}
      {!busy && (
        <div className="actions">
          <button
            className="text-button"
            disabled={status.isFetching || !ready}
            onClick={() => void status.refetch()}
          >
            Check transaction status
          </button>
          {!terminal && (
            <button
              className="text-button"
              onClick={() => {
                if (
                  window.confirm(
                    'Remove this saved tracking record? This does not cancel the transaction. It may still confirm. Check your wallet and explorer first; submitting the same payment again could duplicate it.',
                  )
                )
                  onResolved();
              }}
            >
              Remove saved tracking
            </button>
          )}
          {terminal && (
            <button className="button secondary" onClick={onResolved}>
              Acknowledge & refresh
            </button>
          )}
        </div>
      )}
      <p className="hint">
        Saved in this browser for this testnet deployment. New submissions are
        paused while this transaction is tracked.
      </p>
    </section>
  );
}
