import { formatUnits } from 'viem';
import type { AdminOverview } from './adminTypes';

const count = (value: number | null) =>
  value === null ? 'Not tracked' : value.toLocaleString();
const musd = (value: string | null) =>
  value === null ? 'Unavailable' : `${formatUnits(BigInt(value), 18)} MUSD`;
export function AdminMetrics({ data }: { data: AdminOverview }) {
  const { usage, payments } = data;
  return (
    <div className="admin-metrics">
      <section className="metrics" aria-label="Admin summary">
        <div className="metric">
          <span>RUNWAY REVENUE</span>
          <strong className="admin-status-value">Not collecting fees</strong>
          <p>
            Fee collection is not implemented. Testnet activity is not real
            revenue.
          </p>
        </div>
        <div className="metric">
          <span>WORKSPACES · ALL TIME</span>
          <strong>{count(usage.workspaces)}</strong>
          <p>Stored workspaces in this environment.</p>
        </div>
        <div className="metric">
          <span>OWNER WALLETS · ALL TIME</span>
          <strong>{count(usage.ownerWallets)}</strong>
          <p>Wallets owning a workspace, including internal tests.</p>
        </div>
      </section>
      <div className="admin-grid">
        <section className="panel" aria-label="Workspace activity">
          <span className="eyebrow">PRODUCT USAGE</span>
          <h2>Workspace activity</h2>
          <p>
            Authenticated workspace requests in the selected UTC period. Wallets
            are not a count of people or independent customers.
          </p>
          <dl className="borrowing-values">
            <div>
              <dt>Active wallets · {data.range.days} days</dt>
              <dd>{count(usage.activeWallets)}</dd>
            </div>
            <div>
              <dt>Returning wallets · {data.range.days} days</dt>
              <dd>{count(usage.returningWallets)}</dd>
            </div>
            <div>
              <dt>Saved contractors · all time</dt>
              <dd>{count(usage.contractors)}</dd>
            </div>
            <div>
              <dt>Invoices · all time</dt>
              <dd>{count(usage.invoices)}</dd>
            </div>
          </dl>
          <p className="hint">
            Returning means activity on at least two distinct UTC days. Tracking
            started{' '}
            {usage.trackingSince
              ? new Date(usage.trackingSince).toISOString()
              : 'not yet'}
            . Earlier usage is unavailable.
          </p>
          <details className="admin-daily">
            <summary>
              Daily activity · {data.range.from} to {data.range.to}
            </summary>
            <div className="admin-table-scroll">
              <table>
                <caption>Daily workspace activity (UTC)</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Wallets</th>
                    <th scope="col">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.daily.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{day.date}</th>
                      <td>{count(day.wallets)}</td>
                      <td>{count(day.requests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="panel" aria-label="Service health">
          <span className="eyebrow">OPERATIONS</span>
          <h2>Service health</h2>
          <dl className="admin-status-list">
            <div>
              <dt>Database</dt>
              <dd>Connected</dd>
            </div>
            <div>
              <dt>Payment reconciliation</dt>
              <dd>
                {data.health.reconciliation === 'current'
                  ? 'Current snapshot'
                  : 'Unavailable or stale'}
              </dd>
            </div>
            <div>
              <dt>Request error count</dt>
              <dd>
                {data.health.requestErrorCount === null
                  ? 'Not tracked yet'
                  : `${count(data.health.requestErrorCount)} server errors · observed 24-hour window`}
              </dd>
            </div>
            <div>
              <dt>Operating costs</dt>
              <dd>
                {data.health.operatingCost
                  ? `${data.health.operatingCost.amountUsd} USD · ${data.health.operatingCost.stale ? 'Historical record' : 'Dated actual-cost record'}`
                  : 'Not configured'}
              </dd>
            </div>
            <div>
              <dt>Reconciliation check age</dt>
              <dd>
                {data.health.reconciliationAgeSeconds === null
                  ? 'Unavailable'
                  : `${data.health.reconciliationAgeSeconds} seconds`}
              </dd>
            </div>
          </dl>
          <p className="hint">
            A connected database does not establish indexer freshness. Live RPC
            uptime and wallet failures are not measured here. Cost records, when
            supplied, are operator-provided actual expenses.
          </p>
          {data.health.requests ? (
            <details>
              <summary>Observed API requests and latency</summary>
              <p>
                {count(data.health.requests.requests)} requests;{' '}
                {count(data.health.requests.clientErrors)} client errors;
                average {data.health.requests.averageMs ?? 'Unavailable'} ms;
                p95 upper bound{' '}
                {data.health.requests.p95UpperBoundMs === null
                  ? 'over 60 seconds'
                  : `${data.health.requests.p95UpperBoundMs} ms`}
                .
              </p>
              <p className="hint">
                {data.health.requests.from} to {data.health.requests.to}.
                Observed since {data.health.requests.observedSince}.{' '}
                {data.health.requests.note}
              </p>
            </details>
          ) : null}
          {data.health.operatingCost ? (
            <p className="hint">
              {data.health.operatingCost.source} ·{' '}
              {data.health.operatingCost.periodStart} to{' '}
              {data.health.operatingCost.periodEnd}. Recorded{' '}
              {data.health.operatingCost.recordedAt}.{' '}
              {data.health.operatingCost.note}
            </p>
          ) : null}
        </section>
      </div>
      <section className="panel" aria-label="Payment activity">
        <span className="eyebrow">
          MUSD CONTRACT ACTIVITY · ALL DISCOVERED SCHEDULES
        </span>
        <h2>Payment activity</h2>
        <p>
          Customer payment volume is separate from Runway revenue. This
          contract-wide view includes internal test payments and is independent
          of the activity date filter.
        </p>
        {!payments.available ? (
          <p className="callout warning" role="status">
            Payment totals unavailable. The indexer has no current, consistent
            snapshot.
          </p>
        ) : (
          <>
            {payments.partial ? (
              <p className="callout warning">
                Partial totals: only {payments.loaded.toLocaleString()}{' '}
                schedules are included.
              </p>
            ) : null}
            <dl className="borrowing-values">
              <div>
                <dt>
                  {payments.partial
                    ? 'Loaded funding subtotal'
                    : 'Total funded'}
                </dt>
                <dd>{musd(payments.fundedBaseUnits)}</dd>
              </div>
              <div>
                <dt>Claimed by recipients</dt>
                <dd>{musd(payments.claimedBaseUnits)}</dd>
              </div>
              <div>
                <dt>Refunded to senders</dt>
                <dd>{musd(payments.refundedBaseUnits)}</dd>
              </div>
              <div>
                <dt>Remaining commitments</dt>
                <dd>{musd(payments.committedBaseUnits)}</dd>
              </div>
            </dl>
            <p className="hint">
              {payments.loaded.toLocaleString()} schedules · source block{' '}
              {payments.sourceBlock}. Checked {payments.checkedAt}. Funded does
              not mean paid; payment occurs on claim.
            </p>
          </>
        )}
        <p className="hint">
          Linked one-time invoices:{' '}
          {usage.linkedDirectInvoices.toLocaleString()}. Links are not a current
          paid verdict; one-time transfer volume is not aggregated.
        </p>
      </section>
      <section
        className="callout admin-privacy"
        aria-label="Admin access boundaries"
      >
        <strong>Read-only operational access</strong>
        <p>
          No contractor names, private invoice text, wallet lists or session
          tokens are returned to this dashboard. This access cannot move funds,
          change recipients or control a customer wallet.
        </p>
      </section>
    </div>
  );
}
