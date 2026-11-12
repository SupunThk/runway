import { useEffect, useState } from 'react';
import { calculateScheduleFee } from '@runway/mezo';
import { durationUnits, type DurationUnit } from '../paymentOptions';
import { createFundingIntent, fundingDestination } from '../fundingIntent';
import { useFundingIntent } from '../hooks/useFundingIntent';
import { FundingIntentPanel } from '../FundingIntentPanel';
import type { Address } from 'viem';
import { formatUnits, parseUnits } from 'viem';

export function NewSchedule({
  create,
  canTransact,
  busy,
  address,
}: {
  create: (form: HTMLFormElement) => Promise<void>;
  canTransact: boolean;
  busy: boolean;
  address?: Address;
}) {
  const params = new URLSearchParams(window.location.search);
  const plan = useFundingIntent();
  const [planNotice, setPlanNotice] = useState('');
  const saved = plan.intent;
  useEffect(() => {
    if (saved) history.replaceState(null, '', fundingDestination(saved));
  }, [saved?.id]);
  const invoicePayment = Boolean(
    params.get('invoiceId') ||
    (params.get('reference') &&
      params.get('reference') !== '0x' + '0'.repeat(64)),
  );
  const [paymentType, setPaymentType] = useState(
    params.get('paymentType') === 'one-time' ? 'one-time' : 'schedule',
  );
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    params.has('durationMinutes') ? 'minutes' : 'days',
  );
  const selectedType = saved?.paymentType ?? paymentType;
  const selectedUnit = saved ? 'minutes' : durationUnit;
  const oneTime = selectedType === 'one-time';
  const initialAmount =
    (saved ? formatUnits(BigInt(saved.amountBaseUnits), 18) : undefined) ??
    params.get('amount') ??
    '';
  const [amountInput, setAmountInput] = useState(initialAmount);
  let parsedAmountBaseUnits: bigint | null = null;
  try {
    const raw = (saved ? initialAmount : amountInput).trim();
    if (raw) {
      const parsed = parseUnits(raw, 18);
      if (parsed > 0n) parsedAmountBaseUnits = parsed;
    }
  } catch {
    parsedAmountBaseUnits = null;
  }
  const activeTier =
    invoicePayment || Boolean(saved?.workspaceId) ? 'team' : 'solo';
  const feeBreakdown =
    parsedAmountBaseUnits !== null
      ? calculateScheduleFee(parsedAmountBaseUnits, {
          tier: activeTier,
          waiveOnTestnet: true,
        })
      : null;
  return (
    <>
      {plan.error || planNotice ? (
        <p className="callout warning" role="alert">
          {plan.error || planNotice}
        </p>
      ) : null}
      {saved ? <FundingIntentPanel intent={saved} /> : null}
      {!saved && !plan.requested && plan.saved.length ? (
        <section className="callout" aria-label="Resume a funding plan">
          <h2>Resume a payment plan</h2>
          {plan.saved
            .slice(-5)
            .reverse()
            .map((row) => (
              <p key={row.id}>
                <a href={fundingDestination(row)}>
                  {formatUnits(BigInt(row.amountBaseUnits), 18)} MUSD ·{' '}
                  {row.recipient.slice(0, 8)}…
                </a>
              </p>
            ))}
        </section>
      ) : null}
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
          key={saved?.id ?? 'new'}
          onSubmit={(e) => {
            e.preventDefault();
            void create(e.currentTarget);
          }}
        >
          <fieldset
            disabled={busy || Boolean(plan.error) || (plan.requested && !saved)}
            className="payment-fields"
          >
            <label>
              Payment type
              <select
                name="paymentType"
                disabled={invoicePayment || Boolean(saved)}
                value={selectedType}
                onChange={(event) => setPaymentType(event.target.value)}
              >
                <option value="schedule">Payment over time</option>
                <option value="one-time">One-time payment</option>
              </select>
            </label>
            {invoicePayment || saved ? (
              <input type="hidden" name="paymentType" value={selectedType} />
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
                  saved?.recipient ??
                  new URLSearchParams(window.location.search).get(
                    'recipient',
                  ) ??
                  ''
                }
                required
                readOnly={Boolean(saved)}
                placeholder="0x…"
                autoComplete="off"
              />
            </label>
            <div className="form-row">
              <label>
                {oneTime ? 'Amount · MUSD' : 'Total funding · MUSD'}
                <input
                  name="total"
                  defaultValue={initialAmount}
                  onChange={(event) => setAmountInput(event.target.value)}
                  required
                  readOnly={Boolean(saved)}
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
                    max={durationUnits[selectedUnit].max}
                    step="1"
                    defaultValue={
                      saved?.durationMinutes ??
                      params.get('durationMinutes') ??
                      '1'
                    }
                    readOnly={Boolean(saved)}
                  />
                </label>
              ) : null}
            </div>
            {!oneTime ? (
              <label>
                Period unit
                <select
                  name="durationUnit"
                  value={selectedUnit}
                  disabled={Boolean(saved)}
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
                {saved ? (
                  <input type="hidden" name="durationUnit" value="minutes" />
                ) : null}
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
                  One-time payments have an explorer receipt and do not appear
                  in the schedule list. Invoice status updates after 12
                  confirmations. Amounts and addresses are public. Retain BTC
                  for gas.
                </p>
              ) : (
                <>
                  <p>
                    Accrual starts about two minutes after approval, using chain
                    time. Funds accrue linearly; a claim transaction sends MUSD
                    to the recipient. Only the sender can cancel. Cancellation
                    returns unvested funds and preserves earned payments. All
                    amounts, addresses and timestamps are public.
                  </p>
                  <p>
                    You will approve the exact MUSD amount, then sign a separate
                    funding transaction. Retain BTC for gas.
                  </p>
                </>
              )}
              <p className="hint">
                {activeTier === 'team' ? (
                  <>
                    <strong>Runway fee schedule (Team Operations):</strong> 25
                    bps (0.25%, capped at 25 MUSD per payment)
                    {feeBreakdown
                      ? ` — ${formatUnits(feeBreakdown.standardFeeBaseUnits, 18)} MUSD standard fee waived to 0 MUSD on Mezo Testnet.`
                      : ' — 100% waived on Mezo Testnet.'}{' '}
                    Recipient receives 100% of the funded MUSD.
                  </>
                ) : (
                  <>
                    <strong>Runway fee schedule (Solo Direct):</strong> 0 bps (0
                    MUSD protocol fee on direct schedules and transfers; only
                    Mezo BTC gas applies). Team Operations workspaces are 49
                    MUSD/mo + 25 bps (capped at 25 MUSD, waived on Mezo
                    Testnet).
                  </>
                )}
              </p>
            </div>
            <button
              className="button"
              disabled={
                !canTransact ||
                Boolean(
                  saved?.evidence.funding &&
                  saved.evidence.funding.state !== 'reverted',
                )
              }
            >
              {busy
                ? 'Waiting for transaction…'
                : oneTime
                  ? 'Send MUSD'
                  : 'Approve & fund schedule'}
            </button>
            {saved?.evidence.funding &&
            saved.evidence.funding.state !== 'reverted' ? (
              <p className="hint">
                This plan already has a payment transaction. Check the saved
                funding plan instead of paying again.
              </p>
            ) : null}
            {!saved ? (
              <button
                type="button"
                className="button secondary"
                disabled={!address}
                onClick={(event) => {
                  try {
                    if (!address) return;
                    const row = createFundingIntent(
                      address,
                      event.currentTarget.form!,
                    );
                    location.assign(fundingDestination(row));
                  } catch (error) {
                    setPlanNotice(
                      error instanceof Error
                        ? error.message
                        : 'Could not save this plan.',
                    );
                  }
                }}
              >
                Save payment plan &amp; review funding options
              </button>
            ) : (
              <a href="/?create=1">Start a different payment plan</a>
            )}
          </fieldset>
          {!address ? (
            <p className="hint">Connect your wallet to continue.</p>
          ) : null}
        </form>
      </section>
    </>
  );
}
