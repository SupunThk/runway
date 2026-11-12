import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { apiFetch, readJson } from './api';
import { explorer } from './config';

type RequestRow = {
  _id: string;
  token: string;
  recipient: string;
  amountBaseUnits: string;
  publicMemo: string;
  privateNote: string;
  clientLabel: string;
  expiresAt: string;
  status: string;
  transactionHash?: string;
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const result = await readJson<T & { error?: string }>(response);
  if (!response.ok)
    throw new Error(result.error ?? 'Payment requests are unavailable.');
  return result;
}
export function Receivables({
  workspaceId,
  workspaceName,
  owner,
  canManage = true,
}: {
  workspaceId: string;
  workspaceName: string;
  owner: string;
  canManage?: boolean;
}) {
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const cache = useQueryClient(),
    path = `/workspaces/${workspaceId}/payment-requests`;
  const queryKey = ['receivables', owner.toLowerCase(), workspaceId];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      request<{ items: RequestRow[]; nextCursor: string | null }>(
        path + (pageParam ? `?after=${pageParam}` : ''),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 30_000,
  });
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      body = Object.fromEntries(new FormData(form));
    setBusy(true);
    setNotice('');
    try {
      await request(path, {
        ...body,
        expiresAt: new Date(
          String(body.expiresAt) + 'T23:59:59.000Z',
        ).toISOString(),
      });
      form.reset();
      await cache.invalidateQueries({ queryKey });
      setNotice(
        'Payment link created. Copy it below to share with your client.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not create a payment request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel receivables" aria-label="Client payment links">
      <span className="eyebrow">RECEIVABLES</span>
      <h2>Client payment links</h2>
      <p>
        Request a direct MUSD transfer to your wallet. Private labels stay in
        this workspace; your chosen public business name and memo appear on the
        link.
      </p>
      {notice ? (
        <p role="status" className="callout">
          {notice}
        </p>
      ) : null}
      <details>
        <summary>Create a client payment link</summary>
        <form onSubmit={(event) => void create(event)}>
          <fieldset disabled={busy || !canManage}>
            <label>
              Public business name
              <input
                name="publicBusinessName"
                defaultValue={workspaceName}
                maxLength={80}
                required
              />
            </label>
            <label>
              Payee wallet
              <input name="recipient" defaultValue={owner} required />
            </label>
            <label>
              Client payment amount · MUSD
              <input name="amount" inputMode="decimal" required />
            </label>
            <label>
              Public payment memo
              <input name="publicMemo" maxLength={280} />
            </label>
            <label>
              Private client label
              <input name="clientLabel" maxLength={80} />
            </label>
            <label>
              Private payment note
              <textarea name="privateNote" maxLength={500} />
            </label>
            <label>
              Expires at end of UTC day
              <input
                type="date"
                name="expiresAt"
                defaultValue={new Date(Date.now() + 7 * 86400000)
                  .toISOString()
                  .slice(0, 10)}
                required
              />
            </label>
            <button className="button">Create payment link</button>
          </fieldset>
        </form>
      </details>
      {query.isPending ? <p role="status">Loading payment requests…</p> : null}
      {query.error ? (
        <p className="callout warning" role="alert">
          {query.error.message}{' '}
          <button onClick={() => void query.refetch()}>
            Retry payment requests
          </button>
        </p>
      ) : null}
      {!query.error
        ? query.data?.pages
            .flatMap((p) => p.items)
            .map((row) => (
              <article className="receivable-row" key={row._id}>
                <h3>
                  {row.clientLabel || row.publicMemo || 'MUSD payment request'}
                </h3>
                <p>
                  {formatUnits(BigInt(row.amountBaseUnits), 18)} MUSD ·{' '}
                  <strong>{row.status.replaceAll('_', ' ')}</strong>
                </p>
                <p className="mono">Payee {row.recipient}</p>
                <p className="hint">
                  Expires {row.expiresAt}
                  {row.privateNote ? ` · Private note: ${row.privateNote}` : ''}
                </p>
                <div className="actions">
                  <a href={`/pay/${row.token}`}>Open public payment page</a>
                  <button
                    className="button secondary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${location.origin}/pay/${row.token}`)
                        .then(
                          () => setNotice('Payment link copied.'),
                          () =>
                            setNotice(
                              'Copy failed. Open the payment page and copy its address.',
                            ),
                        );
                    }}
                  >
                    Copy payment link
                  </button>
                  {!row.transactionHash && row.status === 'open' ? (
                    <button
                      disabled={busy || !canManage}
                      className="text-button"
                      onClick={() => {
                        if (
                          !confirm(
                            'Cancel this payment request? A transfer already sent onchain cannot be cancelled.',
                          )
                        )
                          return;
                        setBusy(true);
                        void request(`${path}/${row._id}/cancel`, {})
                          .then(() => cache.invalidateQueries({ queryKey }))
                          .catch((e) => setNotice(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Cancel payment request
                    </button>
                  ) : null}
                  {row.transactionHash ? (
                    <a
                      href={`${explorer}/tx/${row.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View transfer receipt
                    </a>
                  ) : null}
                  {row.status === 'paid' &&
                  row.recipient.toLowerCase() === owner.toLowerCase() ? (
                    <a
                      href={`/borrowing?loanAction=repay&repayAmount=${formatUnits(BigInt(row.amountBaseUnits), 18)}`}
                    >
                      Review repayment from received MUSD
                    </a>
                  ) : null}
                </div>
              </article>
            ))
        : null}
      {query.hasNextPage ? (
        <button
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more payment requests
        </button>
      ) : null}
      <p className="hint">
        A link is visible to anyone who receives its URL. Sharing and collecting
        payment do not repay a loan automatically. Testnet client transfers are
        not Runway fee revenue.
      </p>
    </section>
  );
}
