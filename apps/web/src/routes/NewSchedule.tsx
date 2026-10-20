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
  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <h2>Fund a payment schedule</h2>
        <span className="badge">MUSD</span>
      </div>
      <p>Fully funded upfront. The recipient address is permanent.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create(e.currentTarget);
        }}
      >
        <label>
          Recipient wallet
          <input
            name="recipient"
            defaultValue={
              new URLSearchParams(window.location.search).get('recipient') ?? ''
            }
            required
            placeholder="0x…"
            autoComplete="off"
          />
        </label>
        <div className="form-row">
          <label>
            Total funding · MUSD
            <input
              name="total"
              defaultValue={
                new URLSearchParams(window.location.search).get('amount') ?? ''
              }
              required
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
          <label>
            Accrual duration · minutes
            <input
              name="duration"
              required
              type="number"
              min="1"
              max="525600"
              step="1"
              defaultValue="60"
            />
          </label>
        </div>
        <div className="terms">
          <strong>Before you sign</strong>
          <p>
            Accrual starts about two minutes after approval, using chain time.
            Funds accrue linearly; a claim transaction sends MUSD to the
            recipient. Only the sender can cancel. Cancellation returns unvested
            funds and preserves earned payments. All amounts, addresses and
            timestamps are public.
          </p>
          <p>
            You will approve the exact MUSD amount, then sign a separate funding
            transaction. Retain BTC for gas.
          </p>
        </div>
        <button className="button" disabled={!canTransact}>
          {busy ? 'Waiting for transaction…' : 'Approve & fund schedule'}
        </button>
        {!address ? (
          <p className="hint">Connect your wallet to continue.</p>
        ) : null}
      </form>
    </section>
  );
}
