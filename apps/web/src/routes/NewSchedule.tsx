import { useState } from 'react';
import { durationUnits, type DurationUnit } from '../paymentOptions';

export function NewSchedule({
  create,
  canTransact,
  busy,
  address,
}: {
  create: (form: HTMLFormElement) => Promise<void>;
  canTransact: boolean;
  busy: boolean;
  address?: string;
}) {
  const params = new URLSearchParams(window.location.search);
  const invoicePayment = params.has('reference');
  const [paymentType, setPaymentType] = useState(
    params.get('paymentType') === 'one-time' ? 'one-time' : 'schedule',
  );
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days');
  const oneTime = paymentType === 'one-time';
  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <h2>
          {oneTime ? 'Send a one-time payment' : 'Fund a payment schedule'}
        </h2>
        <span className="badge">MUSD</span>
      </div>
      <p>
        {oneTime
          ? 'Send the full amount directly to the recipient.'
          : 'Fully funded upfront. The recipient address is permanent.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create(e.currentTarget);
        }}
      >
        <fieldset disabled={busy} className="payment-fields">
          <label>
            Payment type
            <select
              name="paymentType"
              disabled={invoicePayment}
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
            >
              <option value="schedule">Payment over time</option>
              <option value="one-time">One-time payment</option>
            </select>
          </label>
          {invoicePayment ? (
            <input type="hidden" name="paymentType" value={paymentType} />
          ) : null}
          {invoicePayment ? (
            <p className="hint">
              {oneTime
                ? 'This invoice will be paid in full with one MUSD transfer.'
                : 'This invoice uses a payment schedule so your workspace can track settlement.'}
            </p>
          ) : null}
          <label>
            Recipient wallet
            <input
              name="recipient"
              defaultValue={
                new URLSearchParams(window.location.search).get('recipient') ??
                ''
              }
              required
              placeholder="0x…"
              autoComplete="off"
            />
          </label>
          <div className="form-row">
            <label>
              {oneTime ? 'Amount · MUSD' : 'Total funding · MUSD'}
              <input
                name="total"
                defaultValue={
                  new URLSearchParams(window.location.search).get('amount') ??
                  ''
                }
                required
                inputMode="decimal"
                placeholder="0.00"
              />
            </label>
            {!oneTime ? (
              <label>
                Payment period
                <input
                  name="duration"
                  required
                  type="number"
                  min="1"
                  max={durationUnits[durationUnit].max}
                  step="1"
                  defaultValue="1"
                />
              </label>
            ) : null}
          </div>
          {!oneTime ? (
            <label>
              Period unit
              <select
                name="durationUnit"
                value={durationUnit}
                onChange={(event) =>
                  setDurationUnit(event.target.value as DurationUnit)
                }
              >
                {Object.entries(durationUnits).map(([value, option]) => (
                  <option key={value} value={value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="hint">
                Use a whole number, up to 365 days. The recipient earns evenly
                over this period.
              </span>
            </label>
          ) : null}
          <div className="terms">
            <strong>Before you sign</strong>
            {oneTime ? (
              <p>
                The full MUSD amount goes directly to the recipient when the
                transaction confirms. No approval or claim is needed. Confirm
                the address and amount; the payment cannot be cancelled.
                One-time payments have an explorer receipt and do not appear in
                the schedule list. Invoice status updates after 12
                confirmations. Amounts and addresses are public. Retain BTC for
                gas.
              </p>
            ) : (
              <>
                <p>
                  Accrual starts about two minutes after approval, using chain
                  time. Funds accrue linearly; a claim transaction sends MUSD to
                  the recipient. Only the sender can cancel. Cancellation
                  returns unvested funds and preserves earned payments. All
                  amounts, addresses and timestamps are public.
                </p>
                <p>
                  You will approve the exact MUSD amount, then sign a separate
                  funding transaction. Retain BTC for gas.
                </p>
              </>
            )}
          </div>
          <button className="button" disabled={!canTransact}>
            {busy
              ? 'Waiting for transaction…'
              : oneTime
                ? 'Send MUSD'
                : 'Approve & fund schedule'}
          </button>
        </fieldset>
        {!address ? (
          <p className="hint">Connect your wallet to continue.</p>
        ) : null}
      </form>
    </section>
  );
}
