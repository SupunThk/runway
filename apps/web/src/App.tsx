import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  parseEventLogs,
  parseUnits,
  zeroHash,
  type Hash,
} from 'viem';
import { paymentsAbi, TESTNET_CHAIN_ID } from '@runway/mezo';
import { WalletConnection } from './WalletConnection';
import {
  chainConfigValid,
  explorer,
  musdAddress,
  paymentAddress,
} from './config';

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message.split('\n')[0]
    : 'Request failed. Please try again.';
}
function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
const amount = (value: bigint, decimals = 18) => formatUnits(value, decimals);

export function App() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const { data: wallet } = useWalletClient();
  const [notice, setNotice] = useState('');
  const [hash, setHash] = useState<Hash>();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'overview' | 'create'>(
    new URLSearchParams(window.location.search).get('create') === '1'
      ? 'create'
      : 'overview',
  );
  const scheduleMatch = /^\/schedules\/([1-9]\d*)\/?$/.exec(
    window.location.pathname,
  );
  const scheduleId = scheduleMatch ? BigInt(scheduleMatch[1]) : undefined;
  const invalidRoute =
    window.location.pathname !== '/' && scheduleId === undefined;

  const readiness = useQuery({
    queryKey: ['deployment', musdAddress, paymentAddress],
    queryFn: async () => {
      if (!client || !chainConfigValid)
        throw new Error('Invalid testnet configuration.');
      if ((await client.getChainId()) !== TESTNET_CHAIN_ID)
        throw new Error('RPC is connected to the wrong chain.');
      if (!musdAddress) return { token: false, payments: false, decimals: 18 };
      const [code, decimals, symbol] = await Promise.all([
        client.getCode({ address: musdAddress }),
        client.readContract({
          address: musdAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
        client.readContract({
          address: musdAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        }),
      ]);
      if (!code || code === '0x' || symbol !== 'MUSD')
        throw new Error('Configured MUSD contract failed validation.');
      let payments = false;
      if (paymentAddress) {
        const [paymentCode, token] = await Promise.all([
          client.getCode({ address: paymentAddress }),
          client.readContract({
            address: paymentAddress,
            abi: paymentsAbi,
            functionName: 'musd',
          }),
        ]);
        payments = Boolean(
          paymentCode &&
          paymentCode !== '0x' &&
          getAddress(token) === musdAddress,
        );
        if (!payments)
          throw new Error(
            'Payment deployment does not match the configured MUSD token.',
          );
      }
      return { token: true, payments, decimals };
    },
    staleTime: 60000,
  });
  const decimals = readiness.data?.decimals ?? 18;
  const balances = useQuery({
    queryKey: ['balances', address, chainId, musdAddress],
    enabled: Boolean(address && client && readiness.isSuccess),
    queryFn: async () => {
      const block = await client!.getBlockNumber();
      const [btc, musd] = await Promise.all([
        client!.getBalance({ address: address!, blockNumber: block }),
        musdAddress && readiness.data?.token
          ? client!.readContract({
              address: musdAddress,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address!],
              blockNumber: block,
            })
          : undefined,
      ]);
      return { btc, musd, block };
    },
    refetchInterval: 15000,
  });
  const schedules = useQuery({
    queryKey: [
      'schedules',
      address,
      chainId,
      paymentAddress,
      scheduleId?.toString(),
    ],
    enabled: Boolean(
      client && readiness.data?.payments && (address || scheduleId),
    ),
    queryFn: async () => {
      const block = await client!.getBlock();
      let ids: readonly bigint[];
      if (scheduleId) ids = [scheduleId];
      else {
        const [sent, received] = await Promise.all([
          client!.readContract({
            address: paymentAddress!,
            abi: paymentsAbi,
            functionName: 'getSenderScheduleIds',
            args: [address!, 0n, 100n],
            blockNumber: block.number,
          }),
          client!.readContract({
            address: paymentAddress!,
            abi: paymentsAbi,
            functionName: 'getRecipientScheduleIds',
            args: [address!, 0n, 100n],
            blockNumber: block.number,
          }),
        ]);
        ids = [...new Set([...sent, ...received])];
      }
      return Promise.all(
        ids.map(async (id) => {
          const [schedule, claimable] = await Promise.all([
            client!.readContract({
              address: paymentAddress!,
              abi: paymentsAbi,
              functionName: 'getSchedule',
              args: [id],
              blockNumber: block.number,
            }),
            client!.readContract({
              address: paymentAddress!,
              abi: paymentsAbi,
              functionName: 'claimable',
              args: [id],
              blockNumber: block.number,
            }),
          ]);
          return { id, ...schedule, claimable, chainTime: block.timestamp };
        }),
      );
    },
    refetchInterval: 15000,
  });
  const canTransact = Boolean(
    address &&
    chainId === TESTNET_CHAIN_ID &&
    wallet &&
    readiness.isSuccess &&
    readiness.data?.payments &&
    !busy,
  );

  async function transaction(action: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    setHash(undefined);
    try {
      if (!canTransact || !client || !wallet)
        throw new Error(
          'Connect to Mezo testnet and verify the payment deployment first.',
        );
      await action();
      await Promise.all([balances.refetch(), schedules.refetch()]);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function settle(id: bigint, cancel: boolean) {
    await transaction(async () => {
      const { request } = await client!.simulateContract({
        account: address!,
        address: paymentAddress!,
        abi: paymentsAbi,
        functionName: cancel ? 'cancel' : 'claim',
        args: [id],
      });
      const tx = await wallet!.writeContract(request);
      setHash(tx);
      setNotice('Transaction submitted. Waiting for confirmation…');
      const receipt = await client!.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success')
        throw new Error('Transaction reverted. Refresh state before retrying.');
      setNotice(
        cancel
          ? 'Cancellation confirmed. Vested funds remain claimable.'
          : 'Claim confirmed. MUSD was sent to the stored recipient.',
      );
    });
  }
  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    await transaction(async () => {
      const recipient = String(data.get('recipient'));
      if (
        !isAddress(recipient) ||
        BigInt(recipient) === 0n ||
        getAddress(recipient) === paymentAddress
      )
        throw new Error('Enter a valid recipient address.');
      const text = String(data.get('total'));
      if (
        !/^\d+(\.\d+)?$/.test(text) ||
        (text.split('.')[1]?.length ?? 0) > decimals
      )
        throw new Error(`Use at most ${decimals} decimal places.`);
      const total = parseUnits(text, decimals);
      if (total <= 0n) throw new Error('Funding must be greater than zero.');
      const durationMinutes = Number(data.get('duration'));
      if (
        !Number.isSafeInteger(durationMinutes) ||
        durationMinutes < 1 ||
        durationMinutes > 525600
      )
        throw new Error('Duration must be 1–525600 whole minutes.');
      const balance = await client!.readContract({
        address: musdAddress!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address!],
      });
      if (balance < total)
        throw new Error('Insufficient MUSD. Fund your wallet first.');
      const allowance = await client!.readContract({
        address: musdAddress!,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address!, paymentAddress!],
      });
      if (allowance < total) {
        setNotice('Approve the exact funding amount in your wallet.');
        const { request } = await client!.simulateContract({
          account: address!,
          address: musdAddress!,
          abi: erc20Abi,
          functionName: 'approve',
          args: [paymentAddress!, total],
        });
        const approval = await wallet!.writeContract(request);
        setHash(approval);
        const receipt = await client!.waitForTransactionReceipt({
          hash: approval,
        });
        if (receipt.status !== 'success')
          throw new Error('Approval reverted; no schedule was funded.');
      }
      // Use current chain time after approval, allowing two minutes for the next signature.
      const block = await client!.getBlock();
      const start = block.timestamp + 120n;
      const end = start + BigInt(durationMinutes) * 60n;
      setNotice(
        'Approval ready. Confirm schedule creation in your wallet; accrual starts about two minutes from now.',
      );
      const { request } = await client!.simulateContract({
        account: address!,
        address: paymentAddress!,
        abi: paymentsAbi,
        functionName: 'createSchedule',
        args: [getAddress(recipient), total, start, end, zeroHash],
      });
      const tx = await wallet!.writeContract(request);
      setHash(tx);
      setNotice('Schedule submitted. Waiting for confirmation…');
      const receipt = await client!.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success')
        throw new Error(
          'Creation reverted; no schedule was funded. Approval may remain. Retry with a fresh start time.',
        );
      const events = parseEventLogs({
        abi: paymentsAbi,
        logs: receipt.logs,
        eventName: 'ScheduleCreated',
      });
      const id = events[0]?.args.scheduleId;
      setNotice(
        id
          ? `Schedule #${id} confirmed. Share its recipient link below.`
          : 'Schedule confirmed. Refresh to view it.',
      );
      setView('overview');
      window.history.replaceState(null, '', '/');
    });
  }

  const outstanding = schedules.data?.reduce(
    (sum, s) =>
      sum + (s.cancelled ? s.vestedAtCancellation : s.total) - s.claimed,
    0n,
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">r</span>runway
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a
            href="/"
            className={view === 'overview' ? 'nav active' : 'nav'}
            onClick={
              scheduleId
                ? undefined
                : (e) => {
                    e.preventDefault();
                    setView('overview');
                  }
            }
          >
            ↗ <span>Overview</span>
          </a>
          <a
            href="/?create=1"
            className={view === 'create' ? 'nav active' : 'nav'}
            onClick={
              scheduleId
                ? undefined
                : (e) => {
                    e.preventDefault();
                    setView('create');
                  }
            }
          >
            ＋ <span>New schedule</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="network-dot" /> Mezo testnet
          <div>Built for teams that build.</div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>MUSD PAYMENT WORKSPACE</span>
          <div className="wallet-tools">
            <span className="badge">TESTNET ONLY</span>
            <WalletConnection onNotice={setNotice} />
          </div>
        </header>
        <div className="content">
          <div className="eyebrow">
            BITCOIN TREASURY, MEET EVERYDAY PAYMENTS
          </div>
          <section className="page-heading">
            <div>
              <h1>
                {scheduleId
                  ? `Payment #${scheduleId}`
                  : view === 'create'
                    ? 'Make room for your next hire.'
                    : 'Your team. Funded forward.'}
              </h1>
              <p>Commit MUSD once. Let your team claim as they earn.</p>
            </div>
            {view === 'overview' && !scheduleId ? (
              <button className="button" onClick={() => setView('create')}>
                ＋ Create schedule
              </button>
            ) : null}
          </section>
          {address && chainId !== TESTNET_CHAIN_ID ? (
            <div className="callout warning">
              Your wallet is on another network.{' '}
              <button
                onClick={async () => {
                  try {
                    await switchChainAsync({ chainId: TESTNET_CHAIN_ID });
                  } catch (e) {
                    setNotice(errorText(e));
                  }
                }}
              >
                Switch to Mezo testnet
              </button>
            </div>
          ) : null}
          {!readiness.data?.payments ? (
            <div className="callout">
              {readiness.isPending
                ? 'Checking testnet connection…'
                : readiness.error
                  ? errorText(readiness.error)
                  : 'Payment deployment pending. You can connect your wallet; funding and claims unlock after the contracts are verified.'}
            </div>
          ) : null}
          {notice ? (
            <div className="callout" role="status">
              {notice}{' '}
              {hash ? (
                <a
                  href={`${explorer}/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction ↗
                </a>
              ) : null}
            </div>
          ) : null}
          {invalidRoute ? (
            <div className="panel">
              <h2>Schedule link not found</h2>
              <p>Check the schedule ID or return to your workspace.</p>
              <a href="/">Back to overview</a>
            </div>
          ) : view === 'create' ? (
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
                </div>
                <button className="button" disabled={!canTransact}>
                  {busy
                    ? 'Waiting for transaction…'
                    : 'Approve & fund schedule'}
                </button>
                {!address ? (
                  <p className="hint">Connect your wallet to continue.</p>
                ) : null}
              </form>
            </section>
          ) : (
            <>
              <section className="metrics" aria-label="Treasury balances">
                <div className="metric">
                  <span>AVAILABLE IN WALLET</span>
                  <strong>
                    {balances.data?.musd !== undefined
                      ? amount(balances.data.musd, decimals)
                      : '—'}{' '}
                    <small>MUSD</small>
                  </strong>
                  <p>
                    {address
                      ? balances.error
                        ? 'Balance unavailable · retry below'
                        : !musdAddress
                          ? 'MUSD configuration pending'
                          : 'Free to fund your next schedule'
                      : 'Connect to see your balance'}
                  </p>
                </div>
                <div className="metric">
                  <span>FUNDED OBLIGATIONS</span>
                  <strong>
                    {outstanding !== undefined
                      ? amount(outstanding, decimals)
                      : '—'}{' '}
                    <small>MUSD</small>
                  </strong>
                  <p>Reserved for recipients · separate from cash</p>
                </div>
                <div className="metric">
                  <span>GAS RESERVE</span>
                  <strong>
                    {balances.data ? amount(balances.data.btc) : '—'}{' '}
                    <small>BTC</small>
                  </strong>
                  <p>Used for approvals, funding and claims</p>
                </div>
              </section>
              <section className="panel schedules">
                <div className="section-heading">
                  <div>
                    <h2>
                      {scheduleId ? 'Recipient payment' : 'Payment schedules'}
                    </h2>
                    <p>Real entitlements. Onchain settlement.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      void balances.refetch();
                      void schedules.refetch();
                    }}
                  >
                    Refresh ↻
                  </button>
                </div>
                {schedules.error ? (
                  <div className="callout warning">
                    Could not load schedules: {errorText(schedules.error)}
                  </div>
                ) : schedules.isFetching && !schedules.data ? (
                  <p>Loading schedule state…</p>
                ) : schedules.data?.length ? (
                  <div className="schedule-list">
                    {schedules.data.map((s) => (
                      <article className="schedule-card" key={String(s.id)}>
                        <div className="section-heading">
                          <a href={`/schedules/${s.id}`}>
                            <strong>Schedule #{String(s.id)}</strong>
                          </a>
                          <span className="badge">
                            {s.cancelled
                              ? 'CANCELLED'
                              : s.claimed === s.total
                                ? 'COMPLETED'
                                : 'FUNDED'}
                          </span>
                        </div>
                        <p>
                          Recipient:{' '}
                          <a
                            href={`${explorer}/address/${s.recipient}`}
                            title={s.recipient}
                          >
                            {short(s.recipient)}
                          </a>
                        </p>
                        <dl>
                          <div>
                            <dt>Total funded</dt>
                            <dd>{amount(s.total, decimals)} MUSD</dd>
                          </div>
                          <div>
                            <dt>Already claimed</dt>
                            <dd>{amount(s.claimed, decimals)} MUSD</dd>
                          </div>
                          <div>
                            <dt>Claimable now</dt>
                            <dd>{amount(s.claimable, decimals)} MUSD</dd>
                          </div>
                          {s.cancelled ? (
                            <>
                              <div>
                                <dt>Total earned by recipient</dt>
                                <dd>
                                  {amount(s.vestedAtCancellation, decimals)}{' '}
                                  MUSD
                                </dd>
                              </div>
                              <div>
                                <dt>Refunded to sender</dt>
                                <dd>
                                  {amount(
                                    s.total - s.vestedAtCancellation,
                                    decimals,
                                  )}{' '}
                                  MUSD
                                </dd>
                              </div>
                            </>
                          ) : null}
                        </dl>
                        {s.cancelled ? (
                          <p className="hint">
                            {s.claimable === 0n
                              ? 'Cancellation settled. All earned MUSD has been paid; the unearned portion was refunded to the sender.'
                              : 'Accrual stopped. The unearned portion was refunded; earned, unpaid MUSD remains claimable.'}
                          </p>
                        ) : s.claimed === s.total ? (
                          <p className="hint">
                            Payment complete. All funded MUSD has been paid to
                            the recipient.
                          </p>
                        ) : s.chainTime >= s.end ? (
                          <p className="hint">
                            Accrual ended. Claim the remaining earned MUSD to
                            complete this payment.
                          </p>
                        ) : null}
                        <p className="hint">
                          {new Date(Number(s.start) * 1000).toLocaleString()} →{' '}
                          {new Date(Number(s.end) * 1000).toLocaleString()}{' '}
                          (your local timezone)
                        </p>
                        <div className="actions">
                          <button
                            className="button"
                            disabled={!canTransact || s.claimable === 0n}
                            onClick={() => void settle(s.id, false)}
                          >
                            Claim to recipient
                          </button>
                          {address &&
                          getAddress(address) === getAddress(s.sender) &&
                          !s.cancelled &&
                          s.chainTime < s.end ? (
                            <button
                              className="button secondary"
                              disabled={!canTransact}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Cancel this schedule? Unvested funds return to you; unpaid vested funds remain claimable. Final amounts depend on chain execution time.',
                                  )
                                )
                                  void settle(s.id, true);
                              }}
                            >
                              Cancel schedule
                            </button>
                          ) : null}
                          <a href={`/schedules/${s.id}`}>Recipient link ↗</a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <div className="empty-icon">↗</div>
                    <h3>
                      {scheduleId
                        ? 'Schedule data unavailable'
                        : address && readiness.data?.payments
                          ? 'Your first payment starts here.'
                          : 'A clearer way to pay your team.'}
                    </h3>
                    <p>
                      {scheduleId
                        ? 'The payment deployment must be configured and reachable to load this link.'
                        : 'Fund a schedule with MUSD, share a link, and let your recipient claim what they’ve earned.'}
                    </p>
                    {!scheduleId ? (
                      <button
                        className="button secondary"
                        onClick={() => setView('create')}
                      >
                        Create your first schedule ↗
                      </button>
                    ) : null}
                  </div>
                )}
                {schedules.data?.length ? (
                  <p className="hint">
                    Initial view shows up to 100 sent and 100 received
                    schedules. Open a direct schedule link for other IDs.
                  </p>
                ) : null}
              </section>
              <section className="info-grid">
                <div className="info-card">
                  <span className="eyebrow">HOW IT WORKS</span>
                  <h2>
                    Committed once.
                    <br />
                    Claimed over time.
                  </h2>
                  <p>
                    Each payment is fully backed by deposited MUSD. Accrual
                    tracks what is earned; the recipient claims it with a
                    transaction.
                  </p>
                </div>
                <div className="info-card light">
                  <span className="eyebrow">MEZO BORROWING</span>
                  <h2>Your borrowing position</h2>
                  <p>
                    Position reads are not verified yet. No debt, collateral or
                    risk values are being estimated.
                  </p>
                  <a
                    href="https://testnet.mezo.org"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Mezo testnet ↗
                  </a>
                </div>
              </section>
            </>
          )}
          <footer>
            <span>Runway · Built on Mezo</span>
            <span>
              Testnet prototype. Use test assets only.
              {balances.data ? ` Data block ${balances.data.block}.` : ''}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
