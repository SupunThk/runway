import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import { Sidebar } from './Sidebar';
import { WalletConnection } from './WalletConnection';
import { apiFetch, readJson } from './api';
import { AdminMetrics } from './AdminMetrics';
import { Icon } from './Icon';
import type { AdminOverview } from './adminTypes';

async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiFetch(`/api${path}`, {
    credentials: 'same-origin',
    signal,
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
    throw Object.assign(
      new Error(result.error ?? 'Admin request failed. Try again.'),
      { status: response.status },
    );
  return result;
}
const statusOf = (error: unknown) =>
  (error as { status?: number } | null)?.status;

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
/** Flattens the snapshot to metric,value rows; formula-leading cells are escaped. */
export function overviewCsv(data: AdminOverview) {
  const rows: [string, string][] = [];
  const walk = (prefix: string, value: unknown) => {
    if (value === null || value === undefined) rows.push([prefix, '']);
    else if (Array.isArray(value))
      value.forEach((item, i) =>
        walk(
          `${prefix}.${(item as { date?: string; code?: string })?.date ?? (item as { code?: string })?.code ?? i}`,
          item,
        ),
      );
    else if (typeof value === 'object')
      for (const [key, inner] of Object.entries(value))
        walk(prefix ? `${prefix}.${key}` : key, inner);
    else rows.push([prefix, String(value)]);
  };
  walk('', data);
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [
    'metric,value',
    ...rows.map(([k, v]) => `${cell(k)},${cell(v)}`),
  ].join('\n');
}
export function Admin() {
  const { address } = useAccount();
  return <AdminContent key={address ?? 'disconnected'} address={address} />;
}
function AdminContent({ address }: { address?: string }) {
  const { chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const cache = useQueryClient();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState('30');
  const wallet = address?.toLowerCase();
  const session = useQuery({
    queryKey: ['admin-session', wallet],
    enabled: Boolean(wallet),
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const response = await apiFetch('/api/admin/session', {
        credentials: 'same-origin',
        signal,
      });
      if (response.status === 401) return { state: 'signed-out' as const };
      if (response.status === 403) return { state: 'denied' as const };
      const result = await readJson<{
        address: string;
        actions?: { reindex?: boolean };
        error?: string;
      }>(response);
      if (!response.ok)
        throw new Error(result.error ?? 'Admin service unavailable.');
      return {
        state: 'authorized' as const,
        address: result.address,
        canReindex: Boolean(result.actions?.reindex),
      };
    },
  });
  const authorized = Boolean(
    wallet &&
    !session.error &&
    session.data?.state === 'authorized' &&
    session.data.address === wallet,
  );
  const fresh = useRef(false);
  const overview = useQuery({
    queryKey: ['admin-overview', wallet, days],
    enabled: authorized,
    retry: false,
    refetchInterval: 60_000,
    queryFn: ({ signal }) =>
      request<AdminOverview>(
        `/admin/overview?days=${days}${fresh.current ? '&fresh=1' : ''}`,
        undefined,
        signal,
      ).finally(() => {
        fresh.current = false;
      }),
  });
  // Authorization failures hide private aggregates; outages keep the last
  // snapshot visible, clearly marked as stale.
  const overviewDenied = [401, 403].includes(statusOf(overview.error) ?? 0);
  const [syncNotice, setSyncNotice] = useState('');
  async function reindex() {
    setBusy(true);
    setSyncNotice('');
    try {
      const result = await request<{ published: boolean }>(
        '/admin/actions/reindex',
        {},
      );
      setSyncNotice(
        result.published
          ? 'Indexer batch completed. Showing a fresh snapshot.'
          : 'Another indexer run is in progress; it will publish shortly.',
      );
      fresh.current = true;
      await overview.refetch();
    } catch (error) {
      setSyncNotice(
        error instanceof Error ? error.message : 'Indexer sync failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    setBusy(true);
    setNotice('');
    try {
      if (!address || chainId !== 31611)
        throw new Error(
          'Connect the admin wallet to Mezo testnet before signing in.',
        );
      const challenge = await request<{ nonce: string; message: string }>(
        '/auth/challenge',
        { address },
      );
      const signature = await signMessageAsync({ message: challenge.message });
      await request('/auth/verify', { nonce: challenge.nonce, signature });
      cache.removeQueries({ queryKey: ['admin-overview'] });
      await cache.invalidateQueries({ queryKey: ['admin-session'] });
      await cache.invalidateQueries({ queryKey: ['workspace-session'] });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message.split('\n')[0]
          : 'Sign-in failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setNotice('');
    // Hide private aggregates immediately, even if logout encounters an outage.
    cache.removeQueries({ queryKey: ['admin-overview'] });
    cache.setQueryData(['admin-session', wallet], { state: 'signed-out' });
    try {
      await request('/auth/logout', {});
      await cache.invalidateQueries({ queryKey: ['workspace-session'] });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Sign-out could not be confirmed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell">
      <Sidebar />
      <main>
        <header className="topbar">
          <span>RUNWAY OPERATIONS</span>
          <div className="wallet-tools">
            <span className="badge">TESTNET ONLY</span>
            <WalletConnection onNotice={setNotice} />
          </div>
        </header>
        <div className="content admin-content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">ADMIN CONSOLE</span>
              <h1>Runway operations</h1>
              <p>
                Usage, payment evidence and business health in one read-only
                view.
              </p>
            </div>
            {authorized ? (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void logout()}
              >
                <Icon name="logout" /> Sign out of admin
              </button>
            ) : null}
          </section>
          {notice ? (
            <p className="callout warning" role="alert">
              {notice}
            </p>
          ) : null}
          {!authorized ? (
            <section className="panel admin-login" aria-label="Admin login">
              <span className="eyebrow">WALLET AUTHENTICATION</span>
              <h2>Sign in to the admin dashboard</h2>
              <p>
                Connect an authorized admin wallet and sign a login message.
                This costs no gas and authorizes no blockchain transaction.
              </p>
              {session.isPending && address ? (
                <p role="status">Checking your admin session…</p>
              ) : null}
              {session.data?.state === 'denied' ? (
                <p className="callout warning" role="alert">
                  This wallet is not authorized for the admin dashboard. Access
                  must be configured on the server.
                </p>
              ) : null}
              {session.error ? (
                <p className="callout warning" role="alert">
                  The admin service is unavailable.{' '}
                  <button
                    className="text-button"
                    onClick={() => void session.refetch()}
                  >
                    Retry admin connection
                  </button>
                </p>
              ) : null}
              {address && chainId !== 31611 ? (
                <p className="hint">
                  Switch to Mezo testnet before signing in.
                </p>
              ) : null}
              <button
                className="button"
                disabled={!address || chainId !== 31611 || busy}
                onClick={() => void login()}
              >
                {busy ? 'Waiting for wallet…' : 'Sign in as admin'}
              </button>
              <p className="hint">
                Knowing this URL does not grant access. Every admin request
                requires an authenticated server session and an allowed wallet
                address.
              </p>
            </section>
          ) : (
            <>
              <section
                className="admin-toolbar"
                aria-label="Admin report controls"
              >
                <label>
                  Activity period
                  <select
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={overview.isFetching}
                  onClick={() => {
                    fresh.current = true;
                    void session.refetch();
                    void overview.refetch();
                  }}
                >
                  <Icon name="refresh" /> Refresh dashboard
                </button>
                {session.data?.state === 'authorized' &&
                session.data.canReindex ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void reindex()}
                    title="Runs one payment-indexer batch now. Cannot move funds."
                  >
                    <Icon name="sync" /> Sync indexer now
                  </button>
                ) : null}
                {overview.data && !overviewDenied ? (
                  <>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        download(
                          `runway-admin-overview-${overview.data.generatedAt.slice(0, 10)}.csv`,
                          'text/csv',
                          overviewCsv(overview.data),
                        )
                      }
                    >
                      <Icon name="download" /> Download CSV
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        download(
                          `runway-admin-overview-${overview.data.generatedAt.slice(0, 10)}.json`,
                          'application/json',
                          JSON.stringify(overview.data, null, 2),
                        )
                      }
                    >
                      <Icon name="download" /> Download JSON snapshot
                    </button>
                  </>
                ) : null}
                <p className="hint admin-snapshot">
                  {overview.data && !overviewDenied
                    ? `Snapshot ${overview.data.generatedAt} · UTC${overview.data.cached ? ' · cached up to 30 s' : ''}`
                    : 'Waiting for a current snapshot.'}
                </p>
              </section>
              {syncNotice ? (
                <p className="callout" role="status">
                  {syncNotice}
                </p>
              ) : null}
              {overview.isPending ? (
                <p role="status">Loading admin metrics…</p>
              ) : null}
              {overview.error ? (
                <p className="callout warning" role="alert">
                  Metrics unavailable: {overview.error.message}.{' '}
                  {overviewDenied || !overview.data
                    ? 'Metrics are hidden until access can be checked.'
                    : `Showing the last snapshot from ${overview.data.generatedAt} UTC, which may be stale.`}
                </p>
              ) : null}
              {overview.data && !overviewDenied ? (
                <div
                  className={overview.error ? 'admin-stale' : undefined}
                  aria-busy={overview.isFetching}
                >
                  <AdminMetrics data={overview.data} />
                </div>
              ) : null}
            </>
          )}
          <footer>
            <span>Runway · Admin access</span>
            <a href="/">Back to Runway</a>
          </footer>
        </div>
      </main>
    </div>
  );
}
