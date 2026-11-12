import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import type {
  TeamInvoice,
  PayrollRun,
  RecurringPlan,
  WorkspaceRole,
} from '@runway/mezo';
import { teamRequest } from './teamApi';
import { TeamForecast } from './TeamForecast';

type Snapshot = {
  workspace: {
    _id: string;
    owner: string;
    name: string;
    role: WorkspaceRole;
    requiredApprovals?: number;
  };
  members: { _id: string; address: string; role: string; status: string }[];
  invoices: TeamInvoice[];
  plans: RecurringPlan[];
  runs: PayrollRun[];
  preferences: { enabled: boolean; dueDays: number };
  reminders: { id: string; kind: string; message: string }[];
  audit: {
    _id: string;
    actor: string;
    action: string;
    outcome: string;
    createdAt: string;
  }[];
  partial: boolean;
  asOf: string;
  report: {
    scope: string;
    invoiceCount: number;
    unknownPayments: number;
    fundedBaseUnits: string;
    claimedBaseUnits: string;
    refundedBaseUnits: string;
    outstandingBaseUnits: string;
  };
};
const musd = (value: string) => formatUnits(BigInt(value), 18);
export function invoicePaymentHref(i: TeamInvoice, workspaceId: string) {
  return `/?${new URLSearchParams({ create: '1', recipient: i.recipient, amount: i.amount, reference: i.paymentReference ?? '', paymentType: i.paymentType ?? 'schedule', workspaceId, invoiceId: i._id })}`;
}
export function TeamOperations({
  workspaceId,
  wallet,
  contractors,
}: {
  workspaceId: string;
  wallet: string;
  contractors: { _id: string; name: string }[];
}) {
  const cache = useQueryClient();
  const prefix = `/workspaces/${workspaceId}`;
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{
    run: PayrollRun;
    invoices: TeamInvoice[];
  } | null>(null);
  const query = useQuery({
    queryKey: ['team-operations', wallet, workspaceId],
    queryFn: () => teamRequest<Snapshot>(`${prefix}/operations`),
    retry: false,
    refetchInterval: 30000,
  });
  async function act(path: string, body: unknown) {
    setBusy(true);
    setNotice('');
    setPlan(null);
    try {
      const result = await teamRequest<{ message?: string }>(
        `${prefix}${path}`,
        body,
      );
      await Promise.all([
        query.refetch(),
        cache.invalidateQueries({ queryKey: ['workspace-records', wallet] }),
      ]);
      setNotice(
        result.message ?? 'Saved. Payment state comes from confirmed evidence.',
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not save. Refresh before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  function form(
    event: FormEvent<HTMLFormElement>,
    path: string,
    transform?: (data: FormData) => unknown,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void act(path, transform ? transform(data) : Object.fromEntries(data));
  }
  async function openRun(run: PayrollRun) {
    setBusy(true);
    setNotice('');
    try {
      setPlan(
        await teamRequest(`${prefix}/payroll-runs/${run._id}/payment-plan`),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Payroll review unavailable.');
    } finally {
      setBusy(false);
    }
  }
  if (query.error)
    return (
      <section className="panel">
        <h2>Team operations unavailable</h2>
        <p role="alert">{query.error.message}</p>
        <button onClick={() => void query.refetch()}>
          Retry team operations
        </button>
      </section>
    );
  if (!query.data)
    return (
      <section className="panel">
        <p>Loading team operations…</p>
      </section>
    );
  const data = query.data;
  const owner = data.workspace.role === 'owner';
  const manage = owner || data.workspace.role === 'manager';
  const review = owner || data.workspace.role === 'approver';
  const today = data.asOf.slice(0, 10);
  return (
    <>
      <section
        className="panel team-operations"
        aria-label="Team treasury operations"
      >
        <span className="eyebrow">TEAM OPERATIONS</span>
        <h2>Review work, prepare payroll</h2>
        <p>
          Your role: <strong>{data.workspace.role}</strong>. Workspace approvals
          control preparation and payment linking in Runway. Wallet owners
          remain responsible for each transaction; these rules do not constrain
          payments made outside the app.
        </p>
        <button
          className="text-button"
          disabled={query.isFetching || busy}
          onClick={() => {
            setPlan(null);
            void query.refetch();
          }}
        >
          Refresh team operations
        </button>
        {notice ? (
          <p className="callout" role="status">
            {notice}
          </p>
        ) : null}
        {data.partial ? (
          <p className="callout warning" role="status">
            Partial view: each section shows at most 100 recent records. Totals
            and exports are scoped to the displayed invoices.
          </p>
        ) : null}
        <details>
          <summary>Team access & approval policy</summary>
          <p>
            Managers prepare records; approvers review immutable payment terms;
            viewers read records; contractors see only their own invitations and
            submitted invoices. Funding remains with the workspace owner's
            wallet.
          </p>
          <div className="schedule-list">
            {data.members.map((m) => (
              <article className="schedule-card" key={m._id}>
                <p>{m.address}</p>
                <p>
                  {m.role} · {m.status}
                </p>
                {owner && m.status !== 'revoked' ? (
                  <button
                    disabled={busy}
                    className="text-button"
                    onClick={() =>
                      void act(
                        `/members/${encodeURIComponent(m._id)}/revoke`,
                        {},
                      )
                    }
                  >
                    Revoke {m.address}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {owner ? (
            <>
              <form
                className="workspace-form"
                onSubmit={(e) => form(e, '/members')}
              >
                <fieldset disabled={busy}>
                  <label>
                    Invited wallet
                    <input
                      name="address"
                      required
                      pattern="0x[a-fA-F0-9]{40}"
                      maxLength={42}
                    />
                  </label>
                  <label htmlFor="workspace-member-role">Workspace role</label>
                  <select id="workspace-member-role" name="role">
                    <option value="viewer">Viewer</option>
                    <option value="manager">Manager</option>
                    <option value="approver">Approver</option>
                    <option value="contractor">Contractor</option>
                  </select>
                  <button className="button secondary">
                    Create wallet invitation
                  </button>
                </fieldset>
              </form>
              <form
                className="workspace-form"
                onSubmit={(e) =>
                  form(e, '/approval-policy', (d) => ({
                    requiredApprovals: Number(d.get('requiredApprovals')),
                  }))
                }
              >
                <fieldset disabled={busy}>
                  <label>
                    Required workspace approvals
                    <input
                      name="requiredApprovals"
                      type="number"
                      min="0"
                      max="5"
                      defaultValue={data.workspace.requiredApprovals ?? 0}
                      required
                    />
                  </label>
                  <p>
                    Zero preserves owner review for ordinary drafts. Submitted
                    invoices and payroll runs always require at least one
                    approval. Policy changes invalidate earlier reviews. Choose
                    a quorum your active approvers can satisfy.
                  </p>
                  <button className="button secondary">
                    Update approval policy
                  </button>
                </fieldset>
              </form>
            </>
          ) : null}
        </details>
        <details>
          <summary>Invoice review queue</summary>
          {data.invoices.filter((i) => !i.scheduleId && !i.transactionHash)
            .length ? (
            data.invoices
              .filter((i) => !i.scheduleId && !i.transactionHash)
              .map((i) => (
                <article className="schedule-card" key={i._id}>
                  <h3>{i.description}</h3>
                  <p>
                    {i.amount} MUSD · {i.recipient} · Due {i.dueDate}
                  </p>
                  <p>
                    {i.submittedBy ? 'Contractor submitted' : 'Workspace draft'}{' '}
                    ·{' '}
                    {i.approval?.rejected
                      ? `Rejected: ${i.reviewRejected}`
                      : `${i.approval?.approvedBy.length ?? 0}/${i.approval?.required ?? 0} approvals${i.approval?.ready ? ' — ready for owner review' : i.approval?.pendingRunId ? ' — payroll run approval pending' : ' — awaiting approval'}`}
                  </p>
                  {review &&
                  !i.approval?.rejected &&
                  i.submittedBy !== wallet ? (
                    <div className="actions">
                      <button
                        className="button secondary"
                        disabled={
                          busy || i.approval?.approvedBy.includes(wallet)
                        }
                        onClick={() =>
                          void act(`/invoices/${i._id}/review`, {
                            decision: 'approve',
                          })
                        }
                      >
                        Approve {i.description}
                      </button>
                      <form
                        onSubmit={(e) =>
                          form(e, `/invoices/${i._id}/review`, (d) => ({
                            decision: 'reject',
                            reason: d.get('reason'),
                          }))
                        }
                      >
                        <label>
                          Reason to reject {i.description}
                          <input name="reason" required maxLength={300} />
                        </label>
                        <button disabled={busy}>Reject invoice</button>
                      </form>
                    </div>
                  ) : null}
                  {owner && i.approval?.ready ? (
                    <a href={invoicePaymentHref(i, workspaceId)}>
                      Review payment for {i.description}
                    </a>
                  ) : null}
                </article>
              ))
          ) : (
            <p>No unlinked invoices to review.</p>
          )}
        </details>
        <details>
          <summary>Payroll runs</summary>
          <p>
            Review exact totals and sign each payment separately. A prepared run
            does not transfer funds. Payment progress below comes from confirmed
            invoice evidence.
          </p>
          {manage ? (
            <form
              className="workspace-form"
              onSubmit={(e) =>
                form(e, '/payroll-runs', (d) => ({
                  name: d.get('name'),
                  invoiceIds: d.getAll('invoiceIds'),
                }))
              }
            >
              <fieldset disabled={busy}>
                <label>
                  Payroll run name
                  <input name="name" maxLength={100} required />
                </label>
                <div className="team-checklist">
                  {data.invoices
                    .filter(
                      (i) =>
                        !i.scheduleId &&
                        !i.transactionHash &&
                        !i.reviewRejected &&
                        !data.runs.some((run) =>
                          run.invoiceIds.includes(i._id),
                        ),
                    )
                    .map((i) => (
                      <label key={i._id}>
                        <input
                          type="checkbox"
                          name="invoiceIds"
                          value={i._id}
                        />
                        {i.description} · {i.amount} MUSD
                      </label>
                    ))}
                </div>
                <button className="button secondary">
                  Prepare payroll run
                </button>
              </fieldset>
            </form>
          ) : null}
          {data.runs.map((run) => {
            const rows = run.invoiceIds.map((id) =>
              data.invoices.find((i) => i._id === id),
            );
            const known = rows.filter((i): i is TeamInvoice => Boolean(i));
            const funded = known.filter((i) =>
              ['funded', 'partially_claimed', 'paid'].includes(
                i.payment?.status ?? '',
              ),
            ).length;
            const paid = known.filter(
              (i) => i.payment?.status === 'paid',
            ).length;
            const unknown =
              rows.length -
              known.length +
              known.filter((i) =>
                ['unavailable', 'conflict', 'awaiting_confirmation'].includes(
                  i.payment?.status ?? 'unavailable',
                ),
              ).length;
            return (
              <article className="schedule-card" key={run._id}>
                <h3>{run.name}</h3>
                <p>
                  {musd(run.totalBaseUnits)} MUSD · {run.invoiceIds.length}{' '}
                  payments · {funded} funded/paid · {paid} settled
                  {unknown ? ` · ${unknown} unverified` : ''}
                </p>
                <p>
                  {run.approval?.approvedBy.length ?? 0}/
                  {run.approval?.required ?? 1} run approvals
                </p>
                <ul>
                  {rows.map((i, index) => (
                    <li key={run.invoiceIds[index]}>
                      {i?.description ?? 'Invoice outside this view'}:{' '}
                      {i?.payment?.status.replaceAll('_', ' ') ?? 'unavailable'}
                      {i?.reviewRejected ? ' — rejected' : ''}
                    </li>
                  ))}
                </ul>
                {review ? (
                  <button
                    className="button secondary"
                    disabled={busy || run.approval?.approvedBy.includes(wallet)}
                    onClick={() =>
                      void act(`/payroll-runs/${run._id}/approve`, {})
                    }
                  >
                    Approve run {run.name}
                  </button>
                ) : null}
                {owner ? (
                  <button
                    className="button secondary"
                    disabled={busy || !run.approval?.ready}
                    onClick={() => void openRun(run)}
                  >
                    Review payments in {run.name}
                  </button>
                ) : null}
              </article>
            );
          })}
          {plan ? (
            <div
              className="callout"
              role="region"
              aria-label="Reviewed payroll payments"
            >
              <h3>
                {plan.run.name}: {musd(plan.run.totalBaseUnits)} MUSD
              </h3>
              <p>
                Fresh wallet balance, account, network and payment simulation
                checks run in each payment form. Check existing evidence before
                resuming.
              </p>
              <ul>
                {plan.invoices.map((i) => (
                  <li key={i._id}>
                    {i.description} · {i.amount} MUSD{' '}
                    {i.scheduleId ? (
                      <a href={`/schedules/${i.scheduleId}`}>
                        View funded schedule
                      </a>
                    ) : i.transactionHash ? (
                      'Transaction already linked; refresh its confirmation state.'
                    ) : (
                      <a href={invoicePaymentHref(i, workspaceId)}>
                        Review and sign {i.description}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </details>
        <details>
          <summary>Recurring payment plans</summary>
          <p>
            Plans prepare one dated invoice at a time. They never initiate
            transactions or promise automatic execution. A missed date stays
            visible until you prepare or pause the plan.
          </p>
          {manage && contractors.length ? (
            <form
              className="workspace-form"
              onSubmit={(e) =>
                form(e, '/recurring-plans', (d) => ({
                  ...Object.fromEntries(d),
                  interval: Number(d.get('interval')),
                }))
              }
            >
              <fieldset disabled={busy}>
                <label>
                  Recurring contractor
                  <select name="contractorId">
                    {contractors.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Recurring description
                  <input name="description" required maxLength={500} />
                </label>
                <label>
                  Recurring MUSD amount
                  <input name="amount" inputMode="decimal" required />
                </label>
                <label>
                  Next recurring due date
                  <input
                    name="nextDueDate"
                    type="date"
                    min="2000-01-01"
                    max="2199-12-31"
                    required
                  />
                </label>
                <label>
                  Recurring cadence
                  <select name="cadence">
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label>
                  Cadence interval
                  <input
                    name="interval"
                    type="number"
                    min="1"
                    max="12"
                    defaultValue="1"
                    required
                  />
                </label>
                <label>
                  Recurring payment type
                  <select name="paymentType">
                    <option value="schedule">Payment over time</option>
                    <option value="one-time">One-time payment</option>
                  </select>
                </label>
                <button className="button secondary">
                  Create recurring plan
                </button>
              </fieldset>
            </form>
          ) : manage ? (
            <p>Save a contractor first to prepare a recurring plan.</p>
          ) : null}
          {data.plans.map((p) => (
            <article className="schedule-card" key={p._id}>
              <h3>{p.description}</h3>
              <p>
                {p.amount} MUSD · Every {p.interval}{' '}
                {p.cadence === 'weekly' ? 'week(s)' : 'month(s)'} · Next{' '}
                {p.nextDueDate}
              </p>
              <p>
                {p.paused
                  ? 'Paused'
                  : p.nextDueDate < today
                    ? 'Missed date — awaiting preparation'
                    : 'Upcoming — not funded'}
              </p>
              {manage ? (
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={busy || p.paused}
                    onClick={() =>
                      void act(`/recurring-plans/${p._id}/prepare`, {
                        dueDate: p.nextDueDate,
                      })
                    }
                  >
                    Prepare {p.nextDueDate} invoice
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(`/recurring-plans/${p._id}/pause`, {
                        paused: !p.paused,
                      })
                    }
                  >
                    {p.paused ? 'Resume' : 'Pause'} {p.description}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </details>
        <details>
          <summary>Reminders & reports</summary>
          <p>
            Reminders are opt-in for this wallet and workspace. They refresh
            while this page is open; no email, push service or background
            payment is configured.
          </p>
          <form
            className="workspace-form"
            onSubmit={(e) =>
              form(e, '/notification-preferences', (d) => ({
                enabled: d.has('enabled'),
                dueDays: Number(d.get('dueDays')),
              }))
            }
          >
            <fieldset disabled={busy}>
              <label>
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={data.preferences.enabled}
                />
                Enable in-app payment reminders
              </label>
              <label>
                Remind within days
                <input
                  name="dueDays"
                  type="number"
                  min="1"
                  max="30"
                  defaultValue={data.preferences.dueDays}
                  required
                />
              </label>
              <button className="button secondary">
                Save reminder preferences
              </button>
            </fieldset>
          </form>
          <ul>
            {data.reminders.map((r) => (
              <li key={r.id}>
                {r.kind}: {r.message}
              </li>
            ))}
          </ul>
          <p>
            {data.report.scope} Source: {new Date(data.asOf).toLocaleString()}.{' '}
            {data.report.unknownPayments} payment records lack verified results.
          </p>
          <div className="team-metrics">
            <p>
              Funded / transferred
              <strong>{musd(data.report.fundedBaseUnits)} MUSD</strong>
            </p>
            <p>
              Received by recipients
              <strong>{musd(data.report.claimedBaseUnits)} MUSD</strong>
            </p>
            <p>
              Remaining escrow entitlement
              <strong>{musd(data.report.outstandingBaseUnits)} MUSD</strong>
            </p>
          </div>
          <a
            className="button secondary"
            href={`/api${prefix}/report.csv`}
            download
          >
            Download workspace report CSV
          </a>
          <h3>Private workspace audit</h3>
          <p>
            Started entries without a completed result require review; they are
            not proof that a change succeeded.
          </p>
          <div className="team-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a._id}>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.actor}</td>
                    <td>{a.action}</td>
                    <td>{a.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <TeamForecast
        key={workspaceId}
        invoices={data.invoices}
        plans={data.plans}
        partial={data.partial}
        asOf={data.asOf}
      />
    </>
  );
}
