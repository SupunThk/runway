import { formatUnits } from 'viem';
import type { AdminOverview } from './adminTypes';
import { DailyBars, Funnel, SplitBar } from './AdminCharts';

const count = (value: number | null) =>
  value === null ? 'Not tracked' : value.toLocaleString();
const musd = (value: string | null) =>
  value === null ? 'Unavailable' : `${formatUnits(BigInt(value), 18)} MUSD`;
const shortMusd = (value: string | null) => {
  if (value === null) return 'Unavailable';
  const [whole, fraction = ''] = formatUnits(BigInt(value), 18).split('.');
  return `${BigInt(whole).toLocaleString()}.${fraction.slice(0, 2).padEnd(2, '0')} MUSD`;
};
const alertIcon = { critical: '■', warning: '▲', info: '●' } as const;
const alertLabel = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Notice',
} as const;
const hoursLabel = (hours: number) =>
  hours < 48 ? `${hours} hours` : `${(hours / 24).toFixed(1)} days`;
export function AdminMetrics({ data }: { data: AdminOverview }) {
  const { usage, payments } = data;
  const alerts = data.alerts ?? [];
  const { funnel, assistant } = data;
  const { indexer, starts } = data.health;
  return (
    <div className="admin-metrics">
      <section className="admin-alerts" aria-label="Active alerts">
        {alerts.length ? (
          <ul>
            {alerts.map((alert) => (
              <li key={alert.code} className={`admin-alert ${alert.level}`}>
                <span aria-hidden="true">{alertIcon[alert.level]}</span>
                <strong>{alertLabel[alert.level]}</strong>
                <span>{alert.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-alert ok">
            <span aria-hidden="true">✓</span>
            <strong>All clear</strong>
            <span>No operational alerts for this snapshot.</span>
          </p>
        )}
      </section>
      <section className="metrics" aria-label="Admin summary">
        <div className="metric">
          <span>RUNWAY REVENUE</span>
          <strong className="admin-status-value">Not collecting fees</strong>
          <p>
            Team tier: 49 MUSD/mo + 25 bps (max 25 MUSD), waived on Mezo
            Testnet.
            {data.revenue.pricingModel
              ? ` Subscription eq: ${musd(data.revenue.pricingModel.monthlySubscriptionEquivalentBaseUnits)}/mo.`
              : ''}
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
          <DailyBars
            title="Active wallets per day"
            unit="wallets"
            points={usage.daily.map((d) => ({
              label: d.date,
              value: d.wallets,
            }))}
          />
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
            <div>
              <dt>Accepted team members</dt>
              <dd>{count(usage.teamMembers ?? 0)}</dd>
            </div>
            <div>
              <dt>Payroll runs · all time</dt>
              <dd>{count(usage.payrollRuns ?? 0)}</dd>
            </div>
            <div>
              <dt>Active recurring plans</dt>
              <dd>{count(usage.recurringPlans ?? 0)}</dd>
            </div>
            <div>
              <dt>Client /pay links</dt>
              <dd>
                {count(usage.paymentRequests ?? 0)} (
                {count(usage.settledPaymentRequests ?? 0)} linked)
              </dd>
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
              <dd>
                Connected
                {data.health.databasePingMs !== undefined
                  ? ` · ${data.health.databasePingMs} ms ping`
                  : ''}
              </dd>
            </div>
            {indexer ? (
              <div>
                <dt>Indexer position</dt>
                <dd>
                  {indexer.indexedBlock === null
                    ? 'No snapshot yet'
                    : `Block ${Number(indexer.indexedBlock).toLocaleString()}${
                        indexer.lagBlocks === null
                          ? ''
                          : ` · ${indexer.lagBlocks.toLocaleString()} behind head (${indexer.confirmations} held back for confirmations)`
                      }`}
                </dd>
              </div>
            ) : null}
            {starts ? (
              <div>
                <dt>Backend starts (cold starts)</dt>
                <dd>
                  {starts.last24Hours} in 24 h · {starts.inRange} in{' '}
                  {data.range.days} days
                  {starts.lastStartedAt
                    ? ` · last ${starts.lastStartedAt.slice(0, 16).replace('T', ' ')} UTC`
                    : ''}
                </dd>
              </div>
            ) : null}
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
              {data.health.requests.byFamily ? (
                <div className="admin-table-scroll">
                  <table>
                    <caption>24-hour API requests by service family</caption>
                    <thead>
                      <tr>
                        <th scope="col">Family</th>
                        <th scope="col">Reqs</th>
                        <th scope="col">4xx</th>
                        <th scope="col">5xx</th>
                        <th scope="col">Avg ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.health.requests.byFamily).map(
                        ([family, stats]) => (
                          <tr key={family}>
                            <th scope="row">{family}</th>
                            <td>{count(stats.requests)}</td>
                            <td>{count(stats.clientErrors)}</td>
                            <td>{count(stats.serverErrors)}</td>
                            <td>
                              {stats.averageMs !== null
                                ? `${stats.averageMs} ms`
                                : '—'}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
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
            <SplitBar
              title="Where funded MUSD is now"
              segments={[
                {
                  key: 'claimed',
                  label: 'Claimed by recipients',
                  value: BigInt(payments.claimedBaseUnits ?? '0'),
                  display: shortMusd(payments.claimedBaseUnits),
                },
                {
                  key: 'refunded',
                  label: 'Refunded to senders',
                  value: BigInt(payments.refundedBaseUnits ?? '0'),
                  display: shortMusd(payments.refundedBaseUnits),
                },
                {
                  key: 'committed',
                  label: 'Still in escrow',
                  value: BigInt(payments.committedBaseUnits ?? '0'),
                  display: shortMusd(payments.committedBaseUnits),
                },
              ]}
            />
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
      {funnel || assistant ? (
        <div className="admin-grid">
          {funnel ? (
            <section className="panel" aria-label="Invoice funnel">
              <span className="eyebrow">TEAM WORKFLOW · ALL TIME</span>
              <h2>Invoice funnel</h2>
              <p>
                How far invoices get, from creation to a linked onchain payment.
                Counts only; no invoice contents are read.
              </p>
              <Funnel
                steps={[
                  { label: 'Created', value: funnel.created },
                  { label: 'Approved by a reviewer', value: funnel.reviewed },
                  {
                    label: 'Added to a payroll run',
                    value: funnel.inPayrollRun,
                  },
                  { label: 'Payment linked', value: funnel.paymentLinked },
                ]}
              />
              <dl className="borrowing-values">
                <div>
                  <dt>Submitted by contractors</dt>
                  <dd>{count(funnel.contractorSubmitted)}</dd>
                </div>
                <div>
                  <dt>Rejected in review</dt>
                  <dd>{count(funnel.rejected)}</dd>
                </div>
                <div>
                  <dt>Median time to payment</dt>
                  <dd>
                    {funnel.medianHoursToPayment === null
                      ? 'No linked payments yet'
                      : hoursLabel(funnel.medianHoursToPayment)}
                  </dd>
                </div>
              </dl>
              <p className="hint">
                Time to payment runs from invoice creation until its payment was
                linked, across the latest {funnel.timedSamples.toLocaleString()}{' '}
                linked invoices. Owners can pay without a reviewer when no
                quorum is set, so steps are not strictly nested.
              </p>
            </section>
          ) : null}
          {assistant ? (
            <section className="panel" aria-label="Assistant usage">
              <span className="eyebrow">
                ASK RUNWAY · {data.range.days} DAYS
              </span>
              <h2>Assistant usage</h2>
              <DailyBars
                title="Questions per day"
                unit="questions"
                points={usage.daily.map((d) => ({
                  label: d.date,
                  value:
                    assistant.daily.find((a) => a.date === d.date)?.questions ??
                    0,
                }))}
              />
              <dl className="borrowing-values">
                <div>
                  <dt>Questions</dt>
                  <dd>{count(assistant.questions)}</dd>
                </div>
                <div>
                  <dt>Answered from sources</dt>
                  <dd>{count(assistant.answered)}</dd>
                </div>
                <div>
                  <dt>Declined (out of scope or not covered)</dt>
                  <dd>{count(assistant.declined)}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>
                    {count(assistant.failed)}
                    {assistant.averageMs !== null
                      ? ` · avg ${(assistant.averageMs / 1000).toFixed(1)} s`
                      : ''}
                  </dd>
                </div>
              </dl>
              {assistant.topSources.length ? (
                <div className="admin-table-scroll">
                  <table>
                    <caption>Most-cited knowledge sections</caption>
                    <thead>
                      <tr>
                        <th scope="col">Section</th>
                        <th scope="col">Citations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assistant.topSources.map((source) => (
                        <tr key={source.id}>
                          <th scope="row">{source.id}</th>
                          <td>{source.citations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="hint">
                A high declined share points to questions the knowledge base
                does not cover yet. Question text is never stored.
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
      {data.health.adminAccess?.length ? (
        <section className="panel" aria-label="Admin access log">
          <span className="eyebrow">SECURITY · 90-DAY RETENTION</span>
          <h2>Admin access log</h2>
          <div className="admin-table-scroll">
            <table>
              <caption>Recent admin activity by wallet and UTC day</caption>
              <thead>
                <tr>
                  <th scope="col">Wallet</th>
                  <th scope="col">Day</th>
                  <th scope="col">Requests</th>
                  <th scope="col">Last seen (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {data.health.adminAccess.map((row) => (
                  <tr key={`${row.wallet}-${row.day}`}>
                    <th scope="row">{row.wallet}</th>
                    <td>{row.day}</td>
                    <td>{row.requests}</td>
                    <td>{row.lastSeenAt.slice(11, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {data.revenue.pricingModel ? (
        <section
          className="panel"
          aria-label="Business model and fee projections"
        >
          <span className="eyebrow">MONETIZATION &amp; FEE SCHEDULE</span>
          <h2>Business model &amp; projected run-rate</h2>
          <p>
            Solo direct schedules and one-time transfers remain 0 bps open
            infrastructure. Multi-wallet Team Operations workspaces carry a 49
            MUSD/month subscription plus a 25 bps (0.25%) coordination fee
            capped at 25 MUSD per payment. All fees are 100% waived during the
            Mezo Testnet pilot.
          </p>
          <dl className="borrowing-values">
            <div>
              <dt>Solo &amp; Open Protocol</dt>
              <dd>0 MUSD/mo · 0 bps</dd>
            </div>
            <div>
              <dt>Team Operations tier</dt>
              <dd>
                {musd(data.revenue.pricingModel.workspaceMonthlyFeeBaseUnits)}
                /mo · {data.revenue.pricingModel.scheduleFeeBps} bps (max{' '}
                {musd(data.revenue.pricingModel.scheduleFeeCapBaseUnits)})
              </dd>
            </div>
            <div>
              <dt>Subscription equivalent</dt>
              <dd>
                {musd(
                  data.revenue.pricingModel
                    .monthlySubscriptionEquivalentBaseUnits,
                )}
                /mo
              </dd>
            </div>
            <div>
              <dt>25 bps volume equivalent</dt>
              <dd>
                {musd(data.revenue.pricingModel.volumeFeeEquivalentBaseUnits)}
              </dd>
            </div>
          </dl>
          <p className="hint">
            Collected on Mezo Testnet: 0 MUSD (100% pilot waiver). Equivalents
            reflect the standard fee schedule applied to stored workspaces and
            indexed schedule volume.
          </p>
        </section>
      ) : null}
      <section
        className="callout admin-privacy"
        aria-label="Admin access boundaries"
      >
        <strong>Read-only operational access</strong>
        <p>
          No contractor names, private invoice text, customer wallet lists or
          session tokens are returned to this dashboard. Its only action asks
          the payment indexer to sync now; it cannot move funds, change
          recipients or control a customer wallet.
        </p>
      </section>
    </div>
  );
}
