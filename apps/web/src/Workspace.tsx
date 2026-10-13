import { useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import { WalletConnection } from './WalletConnection';

type WorkspaceRecord = { _id: string; name: string };
type Contractor = { _id: string; name: string; address: string };
type Invoice = {
  _id: string;
  description: string;
  amount: string;
  recipient: string;
  dueDate: string;
  status: 'draft';
};
type Page<T> = { items: T[]; nextCursor: string | null };
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      'The workspace service is unavailable. Please try again later.',
    );
  }
  if (!response.ok)
    throw new Error(result.error || 'Request failed. Please retry.');
  return result as T;
}
function useRecords<T>(path: string, wallet: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['workspace-records', wallet, path],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      request<Page<T>>(
        `${path}${pageParam ? `?after=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}
const paymentLink = (recipient: string, amount?: string) =>
  `/?${new URLSearchParams({ create: '1', recipient, ...(amount ? { amount } : {}) })}`;

export function Workspace() {
  const { address } = useAccount();
  return <WorkspaceContent key={address ?? 'disconnected'} address={address} />;
}
function WorkspaceContent({ address }: { address?: string }) {
  const { chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const cache = useQueryClient();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [createdWorkspace, setCreatedWorkspace] = useState<WorkspaceRecord>();
  const wallet = address?.toLowerCase() ?? '';
  const session = useQuery({
    queryKey: ['workspace-session', wallet],
    enabled: Boolean(address),
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch('/api/auth/session', {
        credentials: 'same-origin',
      });
      if (response.status === 401) return null;
      if (!response.ok)
        throw new Error(
          'The workspace service is unavailable. Check the backend connection.',
        );
      return (await response.json()) as { address: string };
    },
  });
  const signedIn = Boolean(wallet && session.data?.address === wallet);
  const workspaces = useRecords<WorkspaceRecord>(
    '/workspaces',
    wallet,
    signedIn,
  );
  const loadedWorkspaces = signedIn
    ? (workspaces.data?.pages.flatMap((p) => p.items) ?? [])
    : [];
  const workspaceRows =
    signedIn &&
    createdWorkspace &&
    !loadedWorkspaces.some((row) => row._id === createdWorkspace._id)
      ? [...loadedWorkspaces, createdWorkspace]
      : loadedWorkspaces;
  const workspaceId = workspaceRows.some((w) => w._id === selected)
    ? selected
    : (workspaceRows[0]?._id ?? '');
  const prefix = `/workspaces/${workspaceId}`;
  const contractors = useRecords<Contractor>(
    `${prefix}/contractors`,
    wallet,
    signedIn && Boolean(workspaceId),
  );
  const invoices = useRecords<Invoice>(
    `${prefix}/invoices`,
    wallet,
    signedIn && Boolean(workspaceId),
  );
  const contractorRows = contractors.data?.pages.flatMap((p) => p.items) ?? [];
  const invoiceRows = invoices.data?.pages.flatMap((p) => p.items) ?? [];

  async function action(run: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await run();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message.split('\n')[0]
          : 'Request failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    await action(async () => {
      if (!address || chainId !== 31611)
        throw new Error(
          'Connect your wallet to Mezo testnet before signing in.',
        );
      const challenge = await request<{ nonce: string; message: string }>(
        '/auth/challenge',
        { address },
      );
      const signature = await signMessageAsync({ message: challenge.message });
      await request('/auth/verify', { nonce: challenge.nonce, signature });
      cache.removeQueries({ queryKey: ['workspace-records'] });
      await cache.invalidateQueries({ queryKey: ['workspace-session'] });
    });
  }
  function save(
    event: FormEvent<HTMLFormElement>,
    path: string,
    fields: string[],
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = Object.fromEntries(
      fields.map((field) => [field, String(data.get(field) ?? '')]),
    );
    void action(async () => {
      const record = await request<WorkspaceRecord>(path, body);
      await cache.invalidateQueries({
        queryKey: ['workspace-records', wallet, path],
      });
      if (path === '/workspaces') {
        setCreatedWorkspace(record);
        setSelected(record._id);
      }
      form.reset();
      setNotice('Saved.');
    });
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">r</span>runway
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a href="/" className="nav">
            Overview
          </a>
          <a href="/?create=1" className="nav">
            New schedule
          </a>
          <a href="/workspace" className="nav active" aria-current="page">
            Workspace
          </a>
          <a href="/docs" className="nav">
            Documentation
          </a>
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <span>TEAM WORKSPACE</span>
          <div className="wallet-tools">
            <span className="badge">TESTNET ONLY</span>
            <WalletConnection onNotice={setNotice} />
          </div>
        </header>
        <div className="content workspace-content">
          <section className="page-heading">
            <div>
              <h1>Your team, in one place.</h1>
              <p>
                Save contractors and prepare MUSD invoices before funding a
                payment.
              </p>
            </div>
          </section>
          {notice && (
            <p className="callout" role="status">
              {notice}
            </p>
          )}
          {session.error && (
            <div className="callout warning" role="alert">
              {session.error.message}{' '}
              <button
                className="text-button"
                onClick={() => void session.refetch()}
              >
                Retry connection
              </button>
            </div>
          )}
          {!signedIn ? (
            <section className="panel">
              <h2>Sign in to your workspace</h2>
              <p>
                Connect your wallet, then sign a login message. Signing in does
                not move funds or cost gas. Workspace access currently supports
                personal wallets.
              </p>
              {!address && <p>Connect your wallet using the button above.</p>}
              {address && chainId !== 31611 && (
                <p>Switch your wallet to Mezo testnet to sign in.</p>
              )}
              <button
                className="button"
                disabled={
                  !address || chainId !== 31611 || busy || session.isPending
                }
                onClick={() => void login()}
              >
                {busy ? 'Waiting for signature…' : 'Sign in with wallet'}
              </button>
            </section>
          ) : (
            <>
              <div className="actions">
                <span>Signed in as {address}</span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await request('/auth/logout', {});
                      cache.removeQueries({ queryKey: ['workspace-records'] });
                      await cache.invalidateQueries({
                        queryKey: ['workspace-session'],
                      });
                    })
                  }
                >
                  Sign out of workspace
                </button>
              </div>
              <section className="panel">
                <h2>Workspaces</h2>
                <p>
                  Each workspace is private to the wallet that created it. Team
                  invitations and shared approvals are upcoming.
                </p>
                {workspaces.isPending && <p>Loading workspaces…</p>}
                {workspaces.error && (
                  <p role="alert">
                    {workspaces.error.message}{' '}
                    <button onClick={() => void workspaces.refetch()}>
                      Retry workspaces
                    </button>
                  </p>
                )}
                {workspaceRows.length > 0 && (
                  <label>
                    Active workspace
                    <select
                      value={workspaceId}
                      onChange={(event) => setSelected(event.target.value)}
                    >
                      {workspaceRows.map((row) => (
                        <option key={row._id} value={row._id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {workspaces.hasNextPage && (
                  <button
                    disabled={workspaces.isFetching}
                    onClick={() => void workspaces.fetchNextPage()}
                  >
                    Load more workspaces
                  </button>
                )}
                <form
                  className="workspace-form"
                  onSubmit={(event) => save(event, '/workspaces', ['name'])}
                >
                  <label>
                    New workspace name
                    <input name="name" required maxLength={80} />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Create workspace
                  </button>
                </form>
              </section>
              {workspaceId && (
                <div key={workspaceId}>
                  <section className="panel">
                    <h2>Contractor directory</h2>
                    {contractors.isPending && <p>Loading contractors…</p>}
                    {contractors.error && (
                      <p role="alert">
                        {contractors.error.message}{' '}
                        <button onClick={() => void contractors.refetch()}>
                          Retry contractors
                        </button>
                      </p>
                    )}
                    {!contractors.isPending &&
                      !contractors.error &&
                      contractorRows.length === 0 && (
                        <p>No contractors saved yet.</p>
                      )}
                    <div className="schedule-list">
                      {contractorRows.map((row) => (
                        <article className="schedule-card" key={row._id}>
                          <h3>{row.name}</h3>
                          <p>{row.address}</p>
                          <a href={paymentLink(row.address)}>
                            Create payment for {row.name}
                          </a>
                        </article>
                      ))}
                    </div>
                    {contractors.hasNextPage && (
                      <button
                        disabled={contractors.isFetching}
                        onClick={() => void contractors.fetchNextPage()}
                      >
                        Load more contractors
                      </button>
                    )}
                    <form
                      className="workspace-form"
                      onSubmit={(event) =>
                        save(event, `${prefix}/contractors`, [
                          'name',
                          'address',
                        ])
                      }
                    >
                      <label>
                        Contractor name
                        <input name="name" required maxLength={80} />
                      </label>
                      <label>
                        Contractor wallet
                        <input
                          name="address"
                          required
                          pattern="0x[a-fA-F0-9]{40}"
                          maxLength={42}
                          placeholder="0x…"
                        />
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Save contractor
                      </button>
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Draft invoices</h2>
                    <p>
                      These are planning records created by you. Opening a
                      funding form does not mark an invoice paid or link a
                      confirmed schedule. Review the recipient and amount before
                      signing.
                    </p>
                    {invoices.isPending && <p>Loading invoices…</p>}
                    {invoices.error && (
                      <p role="alert">
                        {invoices.error.message}{' '}
                        <button onClick={() => void invoices.refetch()}>
                          Retry invoices
                        </button>
                      </p>
                    )}
                    {!invoices.isPending &&
                      !invoices.error &&
                      invoiceRows.length === 0 && <p>No draft invoices yet.</p>}
                    <div className="schedule-list">
                      {invoiceRows.map((row) => (
                        <article className="schedule-card" key={row._id}>
                          <span className="badge">DRAFT</span>
                          <h3>{row.description}</h3>
                          <p>
                            {row.amount} MUSD · Due {row.dueDate}
                          </p>
                          <p>Recipient: {row.recipient}</p>
                          <a href={paymentLink(row.recipient, row.amount)}>
                            Prepare payment
                          </a>
                        </article>
                      ))}
                    </div>
                    {invoices.hasNextPage && (
                      <button
                        disabled={invoices.isFetching}
                        onClick={() => void invoices.fetchNextPage()}
                      >
                        Load more invoices
                      </button>
                    )}
                    <form
                      className="workspace-form"
                      onSubmit={(event) =>
                        save(event, `${prefix}/invoices`, [
                          'contractorId',
                          'description',
                          'amount',
                          'dueDate',
                        ])
                      }
                    >
                      <label>
                        Invoice contractor
                        <select
                          aria-label="Invoice contractor"
                          name="contractorId"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Select a saved contractor
                          </option>
                          {contractorRows.map((row) => (
                            <option key={row._id} value={row._id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Invoice description
                        <input name="description" required maxLength={500} />
                      </label>
                      <label>
                        Invoice amount (MUSD)
                        <input
                          name="amount"
                          required
                          inputMode="decimal"
                          pattern="[0-9]+(\.[0-9]{1,18})?"
                          maxLength={79}
                        />
                      </label>
                      <label>
                        Invoice due date
                        <input name="dueDate" required type="date" />
                      </label>
                      <button
                        className="button secondary"
                        disabled={busy || contractorRows.length === 0}
                      >
                        Save draft invoice
                      </button>
                    </form>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
