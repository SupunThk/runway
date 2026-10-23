import { Sidebar } from './Sidebar';
import { Icon } from './Icon';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import { WalletConnection } from './WalletConnection';
import { formatUnits } from 'viem';
import { apiFetch, readJson, BackendUnavailableError } from './api';
import { useBackendWake } from './hooks/useBackendWake';
import { BackendWakeNotice } from './BackendWakeNotice';
import { explorer } from './config';

type WorkspaceRecord = { _id: string; name: string };
type Contractor = { _id: string; name: string; address: string };
type Invoice = {
  _id: string;
  description: string;
  amount: string;
  recipient: string;
  dueDate: string;
  status: 'draft';
  paymentReference?: string;
  paymentType?: 'schedule' | 'one-time';
  payment?: {
    status: string;
    scheduleId?: string;
    transactionHash?: string;
    fundedBaseUnits?: string;
    claimedBaseUnits?: string;
    refundedBaseUnits?: string;
    outstandingBaseUnits?: string;
  };
};
type Page<T> = { items: T[]; nextCursor: string | null };
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
  const result = await readJson<{ error?: string }>(response);
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
    refetchInterval: path.endsWith('/invoices') ? 15000 : false,
  });
}
const paymentLink = (recipient: string, amount?: string, reference?: string) =>
  `/?${new URLSearchParams({ create: '1', recipient, ...(amount ? { amount } : {}), ...(reference ? { reference } : {}) })}`;

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
  const [linkingInvoice, setLinkingInvoice] = useState('');
  const [linkResults, setLinkResults] = useState<
    Record<string, { error: boolean; message: string }>
  >({});
  const [selected, setSelected] = useState('');
  const [createdWorkspace, setCreatedWorkspace] = useState<WorkspaceRecord>();
  const wallet = address?.toLowerCase() ?? '';
  const session = useQuery({
    queryKey: ['workspace-session', wallet],
    enabled: Boolean(address),
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const response = await apiFetch('/api/auth/session', {
        credentials: 'same-origin',
      });
      if (response.status === 401) return null;
      const result = await readJson<{ address: string; error?: string }>(
        response,
      );
      if (!response.ok)
        throw new Error(
          result.error ||
            'The workspace service is unavailable. Check the backend connection.',
        );
      return result;
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
  const wake = useBackendWake(async () => {
    await session.refetch();
    await cache.invalidateQueries({ queryKey: ['workspace-records', wallet] });
  });
  const automaticWakes = useRef(0);
  useEffect(() => {
    if (
      [session.error, workspaces.error, contractors.error, invoices.error].some(
        (error) => error instanceof BackendUnavailableError,
      )
    ) {
      // A ready health route does not prove every application route recovered.
      // Bound automatic retries for one incident; explicit Retry remains available.
      if (automaticWakes.current < 2) {
        automaticWakes.current++;
        wake.wake();
      } else wake.fail();
    } else if (
      session.isSuccess &&
      (!signedIn ||
        (workspaces.isSuccess &&
          (!workspaceId || (contractors.isSuccess && invoices.isSuccess))))
    ) {
      automaticWakes.current = 0;
    }
  }, [
    session.error,
    workspaces.error,
    contractors.error,
    invoices.error,
    wake.wake,
    wake.fail,
    session.isSuccess,
    signedIn,
    workspaces.isSuccess,
    workspaceId,
    contractors.isSuccess,
    invoices.isSuccess,
  ]);
  const contractorRows = contractors.data?.pages.flatMap((p) => p.items) ?? [];
  const invoiceRows = (invoices.data?.pages.flatMap((p) => p.items) ?? []).map(
    (row) =>
      invoices.error ? { ...row, payment: { status: 'unavailable' } } : row,
  );

  async function action(run: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await run();
    } catch (error) {
      if (error instanceof BackendUnavailableError) {
        wake.wake();
        return;
      }
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
  async function linkSchedule(
    invoiceId: string,
    scheduleId: string,
    oneTime = false,
  ) {
    setBusy(true);
    setLinkingInvoice(invoiceId);
    setLinkResults((results) => ({
      ...results,
      [invoiceId]: {
        error: false,
        message: oneTime ? 'Linking transaction…' : 'Linking schedule…',
      },
    }));
    let linked = false;
    try {
      await request(`${prefix}/invoices/${invoiceId}/payment`, {
        ...(oneTime
          ? { transactionHash: scheduleId.trim() }
          : { scheduleId: scheduleId.trim() }),
      });
      linked = true;
      const refreshed = await invoices.refetch();
      if (refreshed.isError) throw refreshed.error;
      setLinkResults((results) => ({
        ...results,
        [invoiceId]: {
          error: false,
          message: oneTime
            ? 'Transfer linked. Payment status updates after 12 confirmations.'
            : 'Confirmed schedule linked.',
        },
      }));
    } catch (error) {
      const message = linked
        ? 'Payment linked, but payment status could not refresh. Use Refresh payment status to check it.'
        : error instanceof BackendUnavailableError
          ? 'Could not confirm the link because the workspace service is unavailable. Refresh payment status, then retry if the schedule is still unlinked.'
          : error instanceof Error
            ? error.message.split('\n')[0]
            : 'Could not link this payment. Please retry.';
      setLinkResults((results) => ({
        ...results,
        [invoiceId]: { error: true, message },
      }));
      if (error instanceof BackendUnavailableError) wake.wake();
    } finally {
      setLinkingInvoice('');
      setBusy(false);
    }
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
      <Sidebar active="workspace" />
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
          <BackendWakeNotice wake={wake} />
          {session.error &&
            !(session.error instanceof BackendUnavailableError) && (
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
            <section className="panel workspace-login">
              <div className="workspace-login-main">
                <div className="empty-icon">
                  <Icon name="lock" />
                </div>
                <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
                <h2>Sign in to your workspace</h2>
                <p>
                  Connect your wallet, then sign a login message. Signing in
                  does not move funds or cost gas. Workspace access currently
                  supports personal wallets.
                </p>
                {!address && <p>Connect your wallet using the button above.</p>}
                {address && chainId !== 31611 && (
                  <p>Switch your wallet to Mezo testnet to sign in.</p>
                )}
                <button
                  className="button"
                  disabled={
                    !address ||
                    chainId !== 31611 ||
                    busy ||
                    session.isPending ||
                    wake.status === 'waking'
                  }
                  onClick={() => void login()}
                >
                  {busy ? 'Waiting for signature…' : 'Sign in with wallet'}
                </button>
              </div>
              <div className="workspace-login-guide">
                <span className="eyebrow">FROM TEAM TO PAYMENT</span>
                <ol className="payment-steps">
                  <li>
                    <span>01</span>
                    <div>
                      <h3>Save your contractors</h3>
                      <p>Keep recipient names and wallet addresses together.</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <h3>Prepare an invoice</h3>
                      <p>
                        Set the amount, recipient and due date before funding.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <h3>Track payment evidence</h3>
                      <p>
                        Review confirmed funding and claims alongside your
                        invoice.
                      </p>
                    </div>
                  </li>
                </ol>
              </div>
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
                    {workspaces.error instanceof BackendUnavailableError
                      ? 'Workspace data unavailable while the backend reconnects.'
                      : workspaces.error.message}{' '}
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
                        {contractors.error instanceof BackendUnavailableError
                          ? 'Contractor data unavailable while the backend reconnects.'
                          : contractors.error.message}{' '}
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
                    <h2>Invoices</h2>
                    <p>
                      Choose a one-time payment or a payment over time. Paid
                      means the recipient received the full MUSD amount.
                      Payments wait for 12 blocks of confirmation. Opening a
                      form does not move funds.
                    </p>
                    <button
                      className="text-button"
                      disabled={invoices.isFetching || busy}
                      onClick={() => void invoices.refetch()}
                    >
                      Refresh payment status
                    </button>
                    {invoices.isPending && <p>Loading invoices…</p>}
                    {invoices.error && (
                      <p role="alert">
                        {invoices.error instanceof BackendUnavailableError
                          ? 'Invoice data unavailable while the backend reconnects.'
                          : invoices.error.message}{' '}
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
                          <span className="badge">
                            {(row.payment?.status ?? 'unavailable')
                              .replaceAll('_', ' ')
                              .toUpperCase()}
                          </span>
                          <h3>{row.description}</h3>
                          <p>
                            {row.amount} MUSD · Due {row.dueDate}
                          </p>
                          <p>Recipient: {row.recipient}</p>
                          <p>
                            {row.paymentType === 'one-time'
                              ? 'One-time payment'
                              : 'Payment over time'}
                          </p>
                          {row.payment?.transactionHash && (
                            <a
                              href={`${explorer}/tx/${row.payment.transactionHash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View payment transaction
                            </a>
                          )}
                          {row.payment?.status === 'unavailable' && (
                            <p>
                              Payment reconciliation is unavailable or catching
                              up. Check existing transactions and schedules
                              before paying again.
                            </p>
                          )}
                          {row.payment?.status === 'conflict' && (
                            <p role="alert">
                              Payment evidence could not be matched uniquely to
                              this invoice. Review the linked payment before
                              sending again.
                            </p>
                          )}
                          {row.payment?.scheduleId && (
                            <>
                              <a href={`/schedules/${row.payment.scheduleId}`}>
                                View schedule #{row.payment.scheduleId}
                              </a>
                              <p>
                                Committed:{' '}
                                {formatUnits(
                                  BigInt(row.payment.fundedBaseUnits ?? '0'),
                                  18,
                                )}{' '}
                                MUSD · Claimed:{' '}
                                {formatUnits(
                                  BigInt(row.payment.claimedBaseUnits ?? '0'),
                                  18,
                                )}{' '}
                                MUSD
                              </p>
                              <p>
                                Remaining entitlement:{' '}
                                {formatUnits(
                                  BigInt(
                                    row.payment.outstandingBaseUnits ?? '0',
                                  ),
                                  18,
                                )}{' '}
                                MUSD · Refunded:{' '}
                                {formatUnits(
                                  BigInt(row.payment.refundedBaseUnits ?? '0'),
                                  18,
                                )}{' '}
                                MUSD
                              </p>
                            </>
                          )}
                          {!row.payment?.scheduleId &&
                            !row.payment?.transactionHash && (
                              <a
                                href={
                                  paymentLink(
                                    row.recipient,
                                    row.amount,
                                    row.paymentReference,
                                  ) +
                                  `&${new URLSearchParams({ paymentType: row.paymentType ?? 'schedule', workspaceId, invoiceId: row._id })}`
                                }
                              >
                                Prepare payment
                              </a>
                            )}
                          {!row.payment?.scheduleId &&
                            !row.payment?.transactionHash && (
                              <form
                                className="workspace-form"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const scheduleId = String(
                                    new FormData(event.currentTarget).get(
                                      'paymentEvidence',
                                    ) ?? '',
                                  );
                                  void linkSchedule(
                                    row._id,
                                    scheduleId,
                                    row.paymentType === 'one-time',
                                  );
                                }}
                              >
                                <label>
                                  {row.paymentType === 'one-time'
                                    ? 'Payment transaction hash for '
                                    : 'Existing schedule ID for '}
                                  {row.description}
                                  <input
                                    name="paymentEvidence"
                                    inputMode={
                                      row.paymentType === 'one-time'
                                        ? 'text'
                                        : 'numeric'
                                    }
                                    pattern={
                                      row.paymentType === 'one-time'
                                        ? '0x[a-fA-F0-9]{64}'
                                        : '[1-9][0-9]*'
                                    }
                                    maxLength={
                                      row.paymentType === 'one-time' ? 66 : 78
                                    }
                                    required
                                  />
                                </label>
                                <button
                                  className="button secondary"
                                  disabled={busy}
                                >
                                  {linkingInvoice === row._id
                                    ? row.paymentType === 'one-time'
                                      ? 'Linking transaction…'
                                      : 'Linking schedule…'
                                    : row.paymentType === 'one-time'
                                      ? 'Link payment transaction'
                                      : 'Link existing schedule'}
                                </button>
                              </form>
                            )}
                          {linkResults[row._id] && (
                            <p
                              className="callout"
                              role={
                                linkResults[row._id].error ? 'alert' : 'status'
                              }
                            >
                              {linkResults[row._id].message}
                            </p>
                          )}
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
                          'paymentType',
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
                        Invoice payment type
                        <select name="paymentType" defaultValue="schedule">
                          <option value="schedule">Payment over time</option>
                          <option value="one-time">One-time payment</option>
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
