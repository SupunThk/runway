import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { explorer, paymentAddress } from './config';
import {
  deploymentBlock,
  eventReceipt,
  orderedHistory,
  readHistoryPage,
  type HistoryCursor,
  type HistoryRecord,
} from './history';

export function TransactionHistory({
  scheduleId,
  revision,
}: {
  scheduleId: bigint;
  revision: number;
}) {
  const [open, setOpen] = useState(false);
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const history = useInfiniteQuery({
    queryKey: [
      'history',
      TESTNET_CHAIN_ID,
      client?.transport.url,
      paymentAddress,
      String(scheduleId),
      revision,
    ],
    enabled: open && Boolean(client && paymentAddress),
    initialPageParam: { from: deploymentBlock } as HistoryCursor,
    queryFn: ({ pageParam }) =>
      readHistoryPage(client!, paymentAddress!, scheduleId, pageParam),
    getNextPageParam: (page) => page.next,
    retry: false,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });
  const records = orderedHistory(
    history.data?.pages.flatMap((p) => p.records) ?? [],
  );
  const last = history.data?.pages.at(-1);
  function download(record: HistoryRecord) {
    const url = URL.createObjectURL(
      new Blob([eventReceipt(record, paymentAddress!, scheduleId)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `runway-${scheduleId}-${record.transactionHash}-${record.logIndex}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="transaction-history"
      aria-label={`Transaction history for schedule ${scheduleId}`}
    >
      <button
        className="text-button"
        aria-expanded={open}
        aria-controls={`history-${scheduleId}`}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide transaction history' : 'Transaction history & receipts'}
      </button>
      {open && (
        <div id={`history-${scheduleId}`}>
          <p>
            Funding, recipient payments and sender refunds. Oldest first. Times
            in UTC.
          </p>
          {history.isFetching && (
            <p role="status">Loading transaction history…</p>
          )}
          {history.error && (
            <div className="callout warning" role="alert">
              Could not load history: {history.error.message.split('\n')[0]}{' '}
              <button
                disabled={history.isFetching}
                onClick={() =>
                  void (history.isFetchNextPageError
                    ? history.fetchNextPage()
                    : history.refetch())
                }
              >
                Retry history
              </button>
            </div>
          )}
          {last && (
            <p className="hint">
              {last.next ? 'Partial history' : 'History scanned'}: blocks{' '}
              {String(deploymentBlock)}–{String(last.end)}. Snapshot head:{' '}
              {String(last.head)}. Refresh for newer transactions.
            </p>
          )}
          {last && !records.length && (
            <p>No payment events found in the scanned blocks.</p>
          )}
          <ol className="history-list">
            {records.map((record) => (
              <li key={`${record.blockHash}:${record.logIndex}`}>
                <div className="section-heading">
                  <strong>
                    {record.event === 'ScheduleCreated'
                      ? 'Schedule funded'
                      : record.event === 'Claimed'
                        ? 'Claim paid to recipient'
                        : 'Cancelled · refunded to sender'}
                  </strong>
                  <span>{formatUnits(record.amount, 18)} MUSD</span>
                </div>
                <p>
                  <time
                    dateTime={new Date(
                      Number(record.timestamp) * 1000,
                    ).toISOString()}
                  >
                    {new Date(Number(record.timestamp) * 1000)
                      .toISOString()
                      .replace('T', ' ')
                      .replace('.000Z', ' UTC')}
                  </time>{' '}
                  · Block {String(record.blockNumber)} · Log {record.logIndex}
                </p>
                <p>
                  {record.event === 'ScheduleCreated'
                    ? 'Sender'
                    : record.event === 'Claimed'
                      ? 'Recipient'
                      : 'Refund recipient'}
                  :{' '}
                  <a
                    href={`${explorer}/address/${record.account}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {record.account}
                  </a>
                </p>
                {record.vested !== undefined && (
                  <p>
                    Recipient earned: {formatUnits(record.vested, 18)} MUSD.
                    Earned funds remain subject to claims.
                  </p>
                )}
                <div className="actions">
                  <a
                    href={`${explorer}/tx/${record.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction ↗
                  </a>
                  <button
                    className="text-button"
                    onClick={() => download(record)}
                  >
                    Download event receipt
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="actions">
            {history.hasNextPage && (
              <button
                className="button secondary"
                disabled={history.isFetching}
                onClick={() => void history.fetchNextPage()}
              >
                Load next blocks
              </button>
            )}
            <button
              className="text-button"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              Refresh history
            </button>
          </div>
          <p className="hint">
            Receipts contain public contract event evidence and exact amounts.
            Open the transaction to inspect its network receipt. Recent blocks
            may change during a chain reorganization.
          </p>
        </div>
      )}
    </section>
  );
}
