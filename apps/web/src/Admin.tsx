import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import { Sidebar } from './Sidebar';
import { WalletConnection } from './WalletConnection';
import { apiFetch, readJson } from './api';
import { AdminMetrics } from './AdminMetrics';
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
    throw new Error(result.error ?? 'Admin request failed. Try again.');
  return result;
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
      const result = await readJson<{ address: string; error?: string }>(
        response,
      );
      if (!response.ok)
        throw new Error(result.error ?? 'Admin service unavailable.');
      return { state: 'authorized' as const, address: result.address };
    },
  });
  const authorized = Boolean(
    wallet &&
    !session.error &&
    session.data?.state === 'authorized' &&
    session.data.address === wallet,
  );
  const overview = useQuery({
    queryKey: ['admin-overview', wallet, days],
    enabled: authorized,
    retry: false,
    refetchInterval: 60_000,
    queryFn: ({ signal }) =>
      request<AdminOverview>(`/admin/overview?days=${days}`, undefined, signal),
  });
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
                Sign out of admin
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
                    void session.refetch();
                    void overview.refetch();
                  }}
                >
                  Refresh dashboard
                </button>
                <p className="hint">
                  {overview.data && !overview.error
                    ? `Snapshot ${overview.data.generatedAt} · UTC`
                    : 'Waiting for a current snapshot.'}
                </p>
              </section>
              {overview.isPending ? (
                <p role="status">Loading admin metrics…</p>
              ) : null}
              {overview.error ? (
                <p className="callout warning" role="alert">
                  Metrics unavailable: {overview.error.message}. Previous
                  metrics are hidden until access and freshness can be checked.
                </p>
              ) : null}
              {overview.data && !overview.error ? (
                <AdminMetrics data={overview.data} />
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
