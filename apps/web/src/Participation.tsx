import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { teamRequest } from './teamApi';
type ParticipationData = {
  invitations: {
    _id: string;
    workspaceId: string;
    workspaceName: string;
    role: string;
    status: string;
  }[];
  contractorWorkspaces: {
    workspaceId: string;
    contractorId: string;
    name: string;
  }[];
  invoices: {
    _id: string;
    description: string;
    amount: string;
    dueDate: string;
    reviewRejected: string | null;
    transactionHash: string | null;
    scheduleId: string | null;
  }[];
  partial: boolean;
};
export function Participation({ wallet }: { wallet: string }) {
  const cache = useQueryClient();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['participation', wallet],
    queryFn: () => teamRequest<ParticipationData>('/participation'),
    retry: false,
  });
  async function act(path: string, body: unknown) {
    setBusy(true);
    setNotice('');
    try {
      await teamRequest(path, body);
      await Promise.all([
        query.refetch(),
        cache.invalidateQueries({ queryKey: ['workspace-records', wallet] }),
      ]);
      setNotice('Saved.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void act(`/participation/${data.workspaceId}/invoices`, data);
  }
  return (
    <section className="panel" aria-label="Invitations and contractor invoices">
      <h2>Invitations & contractor invoices</h2>
      <p>
        Only the invited wallet can accept access. Registered contractors can
        submit their own invoices without seeing other workspace records.
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      {query.error ? (
        <p role="alert">
          {query.error.message}{' '}
          <button onClick={() => void query.refetch()}>
            Retry invitations
          </button>
        </p>
      ) : null}
      {query.data?.partial ? (
        <p className="callout warning">
          Showing the latest 100 invitations and submissions; this list is
          partial.
        </p>
      ) : null}
      {query.data?.invitations
        .filter((i) => i.status === 'invited')
        .map((i) => (
          <article className="schedule-card" key={i._id}>
            <h3>{i.workspaceName}</h3>
            <p>Invited as {i.role}</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void act(`/participation/${i.workspaceId}/accept`, {})
              }
            >
              Accept invitation to {i.workspaceName}
            </button>
          </article>
        ))}
      {query.data?.contractorWorkspaces.length ? (
        <details>
          <summary>Submit a contractor invoice</summary>
          <form className="workspace-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              <label>
                Invoice workspace
                <select name="workspaceId">
                  {query.data.contractorWorkspaces.map((w) => (
                    <option key={w.contractorId} value={w.workspaceId}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Submitted invoice description
                <input name="description" maxLength={500} required />
              </label>
              <label>
                Submitted invoice MUSD
                <input name="amount" inputMode="decimal" required />
              </label>
              <label>
                Submitted invoice due date
                <input
                  name="dueDate"
                  type="date"
                  min="2000-01-01"
                  max="2199-12-31"
                  required
                />
              </label>
              <label>
                Submitted invoice payment type
                <select name="paymentType">
                  <option value="schedule">Payment over time</option>
                  <option value="one-time">One-time payment</option>
                </select>
              </label>
              <button className="button secondary">
                Submit invoice for review
              </button>
            </fieldset>
          </form>
        </details>
      ) : null}
      <div className="schedule-list">
        {query.data?.invoices.map((i) => (
          <article className="schedule-card" key={i._id}>
            <h3>{i.description}</h3>
            <p>
              {i.amount} MUSD · Due {i.dueDate}
            </p>
            <p>
              {i.reviewRejected
                ? `Rejected: ${i.reviewRejected}`
                : i.scheduleId || i.transactionHash
                  ? 'Payment evidence linked; open the receipt to check current confirmation and claim state.'
                  : 'Submitted for workspace review; no payment evidence linked.'}
            </p>
            {i.scheduleId ? (
              <a href={`/schedules/${i.scheduleId}`}>
                View submitted invoice schedule
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
