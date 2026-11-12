import { useInfiniteQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  aggregateFundingProof,
  readFundingProofPage,
  TESTNET_CHAIN_ID,
  type ProofAnchor,
} from '@runway/mezo';
import { formatUnits, isAddress, type Address, type Hash } from 'viem';
import { useState } from 'react';
import { deployedBytecodeHash } from '../../../deployments/mezo-testnet.payments.json';
import { paymentAddress, musdAddress, explorer } from './config';
import { Sidebar } from './Sidebar';
import { isoDate } from './hooks/usePayrollProjection';

export function Proof() {
  const raw = location.pathname.split('/')[2] ?? '';
  const valid = isAddress(raw) && BigInt(raw) !== 0n;
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const [revision, setRevision] = useState(0),
    [notice, setNotice] = useState('');
  const query = useInfiniteQuery({
    queryKey: [
      'public-funding-proof',
      raw.toLowerCase(),
      paymentAddress,
      musdAddress,
      revision,
    ],
    enabled: Boolean(valid && client && paymentAddress && musdAddress),
    retry: false,
    initialPageParam: {
      offset: 0,
      anchor: undefined as ProofAnchor | undefined,
    },
    queryFn: ({ pageParam }) =>
      readFundingProofPage(
        client!,
        {
          contract: paymentAddress!,
          token: musdAddress!,
          codeHash: deployedBytecodeHash as Hash,
        },
        raw as Address,
        pageParam.offset,
        pageParam.anchor,
      ),
    getNextPageParam: (last) =>
      last.hasMore && !last.capped
        ? { offset: last.nextOffset, anchor: last.anchor }
        : undefined,
    refetchOnWindowFocus: false,
  });
  const pages = query.data?.pages ?? [],
    rows = pages.flatMap((p) => p.rows),
    anchor = pages[0]?.anchor;
  const failed = pages.reduce((n, p) => n + p.failed, 0),
    partial =
      failed > 0 || Boolean(query.hasNextPage) || pages.some((p) => p.capped);
  let totals: ReturnType<typeof aggregateFundingProof> | undefined;
  try {
    if (anchor && !query.error) totals = aggregateFundingProof(rows);
  } catch {
    /* Duplicate pages cannot produce an authoritative total. */
  }
  return (
    <div className="shell">
      <Sidebar />
      <main>
        <header className="topbar">
          <span>PUBLIC FUNDING PROOF</span>
          <span className="badge">TESTNET ONLY</span>
        </header>
        <div className="content proof-content">
          <section className="page-heading">
            <div>
              <h1>Funded commitments</h1>
              <p>
                Inspect payment escrow directly from Mezo testnet. No wallet or
                sign-in is required.
              </p>
            </div>
          </section>
          {!valid ? (
            <p className="callout warning" role="alert">
              Enter a valid nonzero sender wallet in the proof link.
            </p>
          ) : (
            <>
              <p className="mono">Sender: {raw}</p>
              {query.isPending ? (
                <p role="status">Reading a confirmed funding snapshot…</p>
              ) : null}
              {query.error ? (
                <p className="callout warning" role="alert">
                  Proof unavailable: {query.error.message}. Previous totals are
                  hidden until a canonical read succeeds.
                </p>
              ) : null}
              {partial && totals ? (
                <p className="callout warning" role="status">
                  Partial proof — {failed} schedules could not be read;{' '}
                  {query.hasNextPage
                    ? 'more pages remain'
                    : 'discovery limit reached or failed rows remain'}
                  . These are loaded subtotals, not complete sender totals.
                </p>
              ) : null}
              {totals && anchor ? (
                <>
                  <section
                    className="metrics"
                    aria-label="Funding proof totals"
                  >
                    <div className="metric">
                      <span>
                        {partial
                          ? 'LOADED COMMITMENT SUBTOTAL'
                          : 'COMMITTED MUSD'}
                      </span>
                      <strong>{formatUnits(totals.committed, 18)}</strong>
                      <p>
                        Remaining recipient entitlement, including earned
                        unclaimed funds.
                      </p>
                    </div>
                    <div className="metric">
                      <span>ACTIVE SCHEDULES {partial ? '· LOADED' : ''}</span>
                      <strong>{totals.active}</strong>
                    </div>
                    <div className="metric">
                      <span>
                        DISTINCT RECIPIENTS {partial ? '· LOADED' : ''}
                      </span>
                      <strong>{totals.recipients}</strong>
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Escrow evidence</h2>
                    <dl className="borrowing-values">
                      <div>
                        <dt>
                          {partial
                            ? 'Loaded funding subtotal'
                            : 'Total ever funded'}
                        </dt>
                        <dd>{formatUnits(totals.funded, 18)} MUSD</dd>
                      </div>
                      <div>
                        <dt>Claimed by recipients</dt>
                        <dd>{formatUnits(totals.claimed, 18)} MUSD</dd>
                      </div>
                      <div>
                        <dt>Refunded to sender</dt>
                        <dd>{formatUnits(totals.refunded, 18)} MUSD</dd>
                      </div>
                    </dl>
                    <p
                      className={
                        anchor.balance >= anchor.obligations
                          ? 'callout'
                          : 'callout warning'
                      }
                    >
                      {anchor.balance >= anchor.obligations
                        ? 'Contract balance covers all outstanding obligations at this snapshot.'
                        : 'Contract balance is below outstanding obligations at this snapshot.'}
                    </p>
                    <p className="hint">
                      Contract-wide MUSD balance{' '}
                      {formatUnits(anchor.balance, 18)}; outstanding obligations{' '}
                      {formatUnits(anchor.obligations, 18)}. This check includes
                      every sender and is separate from this sender's totals.
                    </p>
                    <p>
                      Source block{' '}
                      <a
                        href={`${explorer}/block/${anchor.blockNumber}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {String(anchor.blockNumber)}
                      </a>{' '}
                      ·{' '}
                      {isoDate(anchor.chainTime) ??
                        'Timestamp outside supported calendar range'}
                      . Snapshot uses the 12-block application buffer.
                    </p>
                    <h3>
                      Next schedule end dates{' '}
                      {partial ? 'among loaded records' : ''}
                    </h3>
                    <ul>
                      {rows
                        .filter((r) => r.active)
                        .sort((a, b) => (a.end < b.end ? -1 : 1))
                        .slice(0, 3)
                        .map((r) => (
                          <li key={String(r.id)}>
                            <a href={`/schedules/${r.id}`}>
                              Payment #{String(r.id)}
                            </a>{' '}
                            ·{' '}
                            {isoDate(r.end)?.slice(0, 10) ??
                              'Beyond supported calendar range'}
                          </li>
                        ))}
                    </ul>
                  </section>
                </>
              ) : null}
              <div className="actions">
                <button
                  className="button secondary"
                  disabled={query.isFetching}
                  onClick={() => setRevision((v) => v + 1)}
                >
                  Refresh proof
                </button>
                {query.hasNextPage ? (
                  <button
                    className="button"
                    disabled={query.isFetching}
                    onClick={() => void query.fetchNextPage()}
                  >
                    Load more proof schedules
                  </button>
                ) : null}
                <button
                  className="button secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(location.href).then(
                      () => setNotice('Proof link copied.'),
                      () =>
                        setNotice(
                          'Copy failed. Copy the address from your browser.',
                        ),
                    );
                  }}
                >
                  Copy proof link
                </button>
              </div>
            </>
          )}
          {notice ? <p role="status">{notice}</p> : null}
          <p className="hint">
            This page proves displayed escrow commitments at the source block.
            It does not establish the sender's overall solvency, loan safety,
            future funding or revenue. Cancelled schedules retain only earned,
            unclaimed recipient entitlement. Names and private workspace notes
            are not included.
          </p>
        </div>
      </main>
    </div>
  );
}
