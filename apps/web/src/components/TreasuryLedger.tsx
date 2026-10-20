import type { Address } from 'viem';
import { musdAddress } from '../config';
import { amount } from '../format';
import type { useBalances } from '../hooks/useBalances';
import type { useSchedules } from '../hooks/useSchedules';
export type TreasuryLedgerProps = {
  address?: Address;
  balances: ReturnType<typeof useBalances>;
  schedules: ReturnType<typeof useSchedules>['query'];
  scheduleId?: bigint;
  decimals: number;
  outstanding?: bigint;
};
export function TreasuryLedger({
  address,
  balances,
  schedules,
  scheduleId,
  decimals,
  outstanding,
}: TreasuryLedgerProps) {
  return (
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
        <span>
          {schedules.hasNextPage && !scheduleId
            ? 'LOADED FUNDED OBLIGATIONS'
            : 'FUNDED OBLIGATIONS'}
        </span>
        <strong>
          {outstanding !== undefined ? amount(outstanding, decimals) : '—'}{' '}
          <small>MUSD</small>
        </strong>
        <p>
          {schedules.error
            ? 'Previous snapshot · refresh to verify'
            : schedules.hasNextPage && !scheduleId
              ? 'Partial subtotal · load all schedules for the total'
              : scheduleId
                ? 'This schedule only · sent by you'
                : 'Your sent schedules · separate from cash'}
        </p>
      </div>
      <div className="metric">
        <span>GAS RESERVE</span>
        <strong>
          {balances.data ? amount(balances.data.btc) : '—'} <small>BTC</small>
        </strong>
        <p>Used for approvals, funding and claims</p>
        <p className="hint mono">
          {!address
            ? '—'
            : balances.data?.mezo !== undefined && !balances.error
              ? `${amount(balances.data.mezo)} MEZO · Mezo network token`
              : 'MEZO balance unavailable'}
        </p>
      </div>
    </section>
  );
}
