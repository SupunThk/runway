import { Icon } from '../Icon';
import { errorText } from '../format';
import { ScheduleCard, type ScheduleCardProps } from './ScheduleCard';
import type { useBalances } from '../hooks/useBalances';
import type { useSchedules } from '../hooks/useSchedules';
import type { useDeploymentReadiness } from '../hooks/useDeploymentReadiness';
export type ScheduleListProps = Omit<ScheduleCardProps, 's'> & {
  balances: ReturnType<typeof useBalances>;
  schedules: ReturnType<typeof useSchedules>['query'];
  scheduleRows: ReturnType<typeof useSchedules>['rows'];
  scheduleSnapshot: ReturnType<typeof useSchedules>['snapshot'];
  readiness: ReturnType<typeof useDeploymentReadiness>;
  scheduleId?: bigint;
  setView: (view: 'overview' | 'create') => void;
};
export function ScheduleList({
  address,
  balances,
  schedules,
  scheduleId,
  scheduleRows,
  scheduleSnapshot,
  readiness,
  decimals,
  canTransact,
  settle,
  historyRevision,
  setView,
}: ScheduleListProps) {
  return (
    <section className="panel schedules" aria-label="Payment schedules">
      <div className="section-heading">
        <div>
          <h2>{scheduleId ? 'Recipient payment' : 'Payment schedules'}</h2>
          <p>Real entitlements. Onchain settlement.</p>
        </div>
        <button
          className="text-button"
          disabled={schedules.isFetching}
          onClick={() => {
            void balances.refetch();
            void schedules.refetch();
          }}
        >
          Refresh ↻
        </button>
      </div>
      {schedules.error && (
        <div className="callout warning" role="alert">
          Could not load schedules: {errorText(schedules.error)}
          {schedules.data ? ' Previously loaded schedules remain visible.' : ''}
        </div>
      )}
      {schedules.isFetching && !schedules.data ? (
        <div className="schedule-loading" role="status">
          <p>Loading schedule state…</p>
          <span className="skeleton-line" aria-hidden="true" />
          <span className="skeleton-line short" aria-hidden="true" />
        </div>
      ) : scheduleRows?.length ? (
        <div className="schedule-list">
          {scheduleRows.map((s) => (
            <ScheduleCard
              key={String(s.id)}
              s={s}
              address={address}
              decimals={decimals}
              canTransact={canTransact}
              settle={settle}
              historyRevision={historyRevision}
            />
          ))}
        </div>
      ) : !schedules.error ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="wallet" />
          </div>
          <div className="empty-copy">
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
        </div>
      ) : null}
      {scheduleSnapshot ? (
        <div className="schedule-pagination">
          <p className="hint" role="status">
            {scheduleRows?.length} unique schedules loaded · Block{' '}
            {String(scheduleSnapshot.blockNumber)}
            {' · '}
            {new Date(Number(scheduleSnapshot.chainTime) * 1000)
              .toISOString()
              .replace('T', ' ')
              .replace('.000Z', ' UTC')}
            {scheduleId
              ? ' · Direct schedule view.'
              : schedules.hasNextPage
                ? ' · Partial list; more schedules may be available.'
                : ' · All sent and received schedules loaded at this snapshot.'}
            {schedules.error && !schedules.isFetchNextPageError
              ? ' Refresh failed; displayed values are from the previous snapshot.'
              : ''}
          </p>
          {schedules.hasNextPage && !scheduleId && (
            <button
              className="button secondary"
              disabled={schedules.isFetching}
              onClick={() => void schedules.fetchNextPage()}
            >
              {schedules.isFetchingNextPage
                ? 'Loading more schedules…'
                : schedules.isFetchNextPageError
                  ? 'Retry loading more schedules'
                  : 'Load more schedules'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
