import { useMemo, useState, type FormEvent } from 'react';
import {
  cashForecast,
  nextOccurrence,
  type ForecastEntry,
  type TeamInvoice,
  type RecurringPlan,
} from '@runway/mezo';
import { formatUnits, parseUnits } from 'viem';

export function TeamForecast({
  invoices,
  plans,
  partial,
  asOf,
}: {
  invoices: TeamInvoice[];
  plans: RecurringPlan[];
  partial: boolean;
  asOf: string;
}) {
  const [assumptions, setAssumptions] = useState({
    wallet: '0',
    reserve: '0',
    days: 90,
    includeExpected: false,
  });
  const [expected, setExpected] = useState<ForecastEntry[]>([]);
  const [error, setError] = useState('');
  const start = asOf.slice(0, 10);
  const projection = useMemo(() => {
    try {
      const entries: ForecastEntry[] = invoices
        .filter(
          (i) =>
            !i.reviewRejected &&
            !i.scheduleId &&
            !i.transactionHash &&
            i.payment?.status === 'draft',
        )
        .map((i) => ({
          id: `invoice:${i._id}`,
          date: i.dueDate,
          amountBaseUnits: i.amountBaseUnits,
          direction: 'out',
          assumed: false,
          label: i.description,
        }));
      let projectionLimited = false;
      for (const plan of plans.filter((p) => !p.paused)) {
        let due = plan.nextDueDate;
        for (let count = 0; count < 54; count++) {
          if (Date.parse(due) > Date.parse(start) + assumptions.days * 86400000)
            break;
          if (!invoices.some((i) => i.recurrenceKey === `${plan._id}:${due}`))
            entries.push({
              id: `plan:${plan._id}:${due}`,
              date: due,
              amountBaseUnits: plan.amountBaseUnits,
              direction: 'out',
              assumed: false,
              label: plan.description,
            });
          due = nextOccurrence({ ...plan, nextDueDate: due });
          if (
            count === 53 &&
            Date.parse(due) <= Date.parse(start) + assumptions.days * 86400000
          )
            projectionLimited = true;
        }
      }
      const incomplete =
        partial ||
        projectionLimited ||
        invoices.some((i) =>
          ['unavailable', 'conflict', 'awaiting_confirmation'].includes(
            i.payment?.status ?? 'unavailable',
          ),
        );
      return {
        result: cashForecast({
          start,
          days: assumptions.days,
          walletBaseUnits: parseUnits(assumptions.wallet, 18).toString(),
          reserveBaseUnits: parseUnits(assumptions.reserve, 18).toString(),
          entries: [...entries, ...expected],
          includeExpected: assumptions.includeExpected,
          incomplete,
        }),
        error: '',
      };
    } catch {
      return {
        result: null,
        error:
          'Use nonnegative MUSD amounts with at most 18 decimals and a horizon of 1–365 days.',
      };
    }
  }, [invoices, plans, partial, start, assumptions, expected]);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const wallet = String(data.get('wallet'));
    const reserve = String(data.get('reserve'));
    if (![wallet, reserve].every((v) => /^\d{1,60}(\.\d{1,18})?$/.test(v))) {
      setError('Enter nonnegative MUSD amounts with at most 18 decimals.');
      return;
    }
    setError('');
    setAssumptions({
      wallet,
      reserve,
      days: Number(data.get('days')),
      includeExpected: data.has('includeExpected'),
    });
  }
  function addReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = String(data.get('amount'));
    if (
      !/^\d{1,60}(\.\d{1,18})?$/.test(amount) ||
      parseUnits(amount, 18) <= 0n ||
      expected.length >= 100
    ) {
      setError(
        'Add a positive expected receipt; at most 100 assumptions are supported.',
      );
      return;
    }
    setExpected((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        date: String(data.get('date')),
        amountBaseUnits: parseUnits(amount, 18).toString(),
        direction: 'in',
        assumed: true,
        label: String(data.get('label')),
      },
    ]);
    form.reset();
    setError('');
  }
  return (
    <section className="panel" aria-label="Dated treasury forecast">
      <h2>Dated treasury forecast</h2>
      <p>
        Enter a reviewed wallet balance as an assumption. The repayment reserve
        reduces usable cash once. Already funded escrow and receipts already in
        your balance are excluded from future cash flows. Gas, future interest
        and BTC prices are not predicted.
      </p>
      <form className="workspace-form" onSubmit={save}>
        <label>
          Assumed wallet MUSD
          <input name="wallet" defaultValue="0" required inputMode="decimal" />
        </label>
        <label>
          Forecast repayment reserve
          <input name="reserve" defaultValue="0" required inputMode="decimal" />
        </label>
        <label>
          Forecast days
          <input
            name="days"
            type="number"
            min="1"
            max="365"
            defaultValue="90"
            required
          />
        </label>
        <label>
          <input name="includeExpected" type="checkbox" />
          Include expected receipts as assumptions
        </label>
        <button className="button secondary">Update forecast</button>
      </form>
      <details>
        <summary>Expected revenue assumptions</summary>
        <p>
          These entries stay in this page session and are never treated as
          confirmed income or borrowing eligibility.
        </p>
        <form className="workspace-form" onSubmit={addReceipt}>
          <label>
            Expected receipt label
            <input name="label" maxLength={100} required />
          </label>
          <label>
            Expected receipt date
            <input
              name="date"
              type="date"
              min="2000-01-01"
              max="2199-12-31"
              required
            />
          </label>
          <label>
            Expected receipt MUSD
            <input name="amount" inputMode="decimal" required />
          </label>
          <button className="button secondary">Add expected receipt</button>
        </form>
        <ul>
          {expected.map((e) => (
            <li key={e.id}>
              {e.label}: {formatUnits(BigInt(e.amountBaseUnits), 18)} MUSD on{' '}
              {e.date}{' '}
              <button
                className="text-button"
                onClick={() =>
                  setExpected((rows) => rows.filter((r) => r.id !== e.id))
                }
              >
                Remove {e.label}
              </button>
            </li>
          ))}
        </ul>
      </details>
      {error || projection.error ? (
        <p role="alert">{error || projection.error}</p>
      ) : null}
      {projection.result ? (
        <>
          {projection.result.incomplete ? (
            <p className="callout warning" role="status">
              Partial forecast: some payment evidence or source records are
              unavailable. Verify outstanding payments before funding again.
            </p>
          ) : null}
          <p>
            Source records {new Date(asOf).toLocaleString()}; assumptions are
            local to this session.
          </p>
          <div className="team-metrics">
            <p>
              Lowest usable cash
              <strong>
                {formatUnits(BigInt(projection.result.minimumBaseUnits), 18)}{' '}
                MUSD
              </strong>
            </p>
            <p>
              Ending usable cash
              <strong>
                {formatUnits(BigInt(projection.result.endingBaseUnits), 18)}{' '}
                MUSD
              </strong>
            </p>
            <p>
              First projected shortfall
              <strong>
                {projection.result.firstShortfall ?? 'None in selected range'}
              </strong>
            </p>
          </div>
          {projection.result.firstShortfall ? (
            <p className="callout warning">
              Cash risk: the selected assumptions do not cover all dated
              obligations. Review funding and repayment reserves.
            </p>
          ) : null}
          <details>
            <summary>Daily cash projection</summary>
            <div className="team-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Usable MUSD</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.result.days.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{formatUnits(BigInt(d.usableBaseUnits), 18)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
