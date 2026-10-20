import { Sidebar } from './Sidebar';
import { Icon } from './Icon';
import { useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { WalletConnection } from './WalletConnection';
import { usePendingTransaction } from './pending';
import { PendingTransactionPanel } from './PendingTransactionPanel';
import { explorer, paymentAddress } from './config';
import { errorText } from './format';
import { useDeploymentReadiness } from './hooks/useDeploymentReadiness';
import { useBalances } from './hooks/useBalances';
import { useSchedules } from './hooks/useSchedules';
import { usePaymentActions } from './hooks/usePaymentActions';
import { NewSchedule } from './routes/NewSchedule';
import { Overview } from './routes/Overview';
import { ScheduleDetail } from './routes/ScheduleDetail';
export function App() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const { data: wallet } = useWalletClient();
  const recovery = usePendingTransaction(paymentAddress);
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

  const readiness = useDeploymentReadiness();
  const decimals = readiness.data?.decimals ?? 18;
  const balances = useBalances({ address, chainId, readiness });
  const {
    query: schedules,
    rows: scheduleRows,
    snapshot: scheduleSnapshot,
    outstanding,
  } = useSchedules({ address, chainId, scheduleId, readiness });
  const {
    notice,
    setNotice,
    hash,
    busy,
    historyRevision,
    setHistoryRevision,
    canTransact,
    create,
    settle,
  } = usePaymentActions({
    client,
    wallet,
    address,
    chainId,
    readiness,
    recovery,
    balances,
    schedules,
    decimals,
    onCreated: () => setView('overview'),
  });
  const routeProps = {
    address,
    balances,
    schedules,
    scheduleId,
    scheduleRows,
    scheduleSnapshot,
    readiness,
    decimals,
    outstanding,
    canTransact,
    settle,
    historyRevision,
    setView,
  };
  return (
    <div className="shell">
      <Sidebar active={invalidRoute || scheduleId ? undefined : view} />
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
                <Icon name="plus" /> Create schedule
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
          {recovery.error && (
            <div className="callout warning" role="alert">
              {recovery.error}
              {!recovery.pending && (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove the unreadable tracking record? This does not cancel any transaction. Check your wallet and explorer before submitting again.',
                      )
                    )
                      recovery.resetDamagedRecord();
                  }}
                >
                  Remove unreadable tracking
                </button>
              )}
            </div>
          )}
          {recovery.pending && (
            <PendingTransactionPanel
              pending={recovery.pending}
              busy={busy}
              ready={Boolean(readiness.data?.payments)}
              onResolved={() => {
                recovery.clear(recovery.pending!.hash);
                setHistoryRevision((value) => value + 1);
                if (address) void balances.refetch();
                void schedules.refetch();
              }}
            />
          )}
          {invalidRoute ? (
            <div className="panel">
              <h2>Schedule link not found</h2>
              <p>Check the schedule ID or return to your workspace.</p>
              <a href="/">Back to overview</a>
            </div>
          ) : view === 'create' ? (
            <NewSchedule
              address={address}
              create={create}
              canTransact={canTransact}
              busy={busy}
            />
          ) : scheduleId ? (
            <ScheduleDetail {...routeProps} />
          ) : (
            <Overview {...routeProps} />
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
