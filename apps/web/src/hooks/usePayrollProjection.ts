import { useEffect, useState } from 'react';
import {
  activeSchedules,
  fundedThrough,
  paymentRatePerSecond,
  payrollCoveredUntil,
  TESTNET_CHAIN_ID,
} from '@runway/mezo';
import type { Address } from 'viem';
import { errorText } from '../format';
import type { useDeploymentReadiness } from './useDeploymentReadiness';
import type { useBalances } from './useBalances';
import type { useSchedules } from './useSchedules';

export type PayrollInputs = {
  address?: Address;
  chainId?: number;
  readiness: ReturnType<typeof useDeploymentReadiness>;
  balances: ReturnType<typeof useBalances>;
  schedules: ReturnType<typeof useSchedules>['query'];
  scheduleRows: ReturnType<typeof useSchedules>['rows'];
  scheduleSnapshot: ReturnType<typeof useSchedules>['snapshot'];
};
export const projectionAssumptions =
  'Assumes each current payment stream renews immediately at its existing rate, using wallet MUSD as its escrow ends. Future-starting schedules are excluded. Rates round up conservatively. Planning month = 30 days.';
export const localDate = (time: bigint) => {
  const milliseconds = Number(time * 1000n);
  return Number.isSafeInteger(milliseconds) &&
    Math.abs(milliseconds) <= 8640000000000000
    ? new Date(milliseconds).toLocaleDateString()
    : 'beyond the supported calendar range';
};
export const isoDate = (time: bigint) => {
  const milliseconds = Number(time * 1000n);
  return Number.isSafeInteger(milliseconds) &&
    Math.abs(milliseconds) <= 8640000000000000
    ? new Date(milliseconds).toISOString()
    : undefined;
};

export function usePayrollProjection({
  address,
  chainId,
  readiness,
  balances,
  schedules,
  scheduleRows,
  scheduleSnapshot,
}: PayrollInputs) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  let reason: string | undefined;
  if (!address) reason = 'Connect your wallet to plan your runway.';
  else if (chainId !== TESTNET_CHAIN_ID)
    reason = 'Your wallet is on another network. Switch to Mezo testnet';
  else if (readiness.error) reason = errorText(readiness.error);
  else if (readiness.isPending) reason = 'Checking testnet connection…';
  else if (!readiness.data?.payments)
    reason =
      'Payment deployment pending. Funding and claims unlock after the contracts are verified.';
  else if (readiness.data.decimals !== 18)
    reason = 'Payment token decimals are unsupported for runway planning.';
  else if (schedules.error || balances.error)
    reason = 'Payment data unavailable · refresh to retry.';
  else if (schedules.isPending || balances.isPending)
    reason = 'Loading payment data…';
  else if (
    !scheduleSnapshot ||
    !scheduleRows ||
    balances.data?.musd === undefined
  )
    reason = 'Payment data unavailable · refresh to retry.';
  else if (schedules.hasNextPage)
    reason = 'Load all schedules on Overview to plan accurately.';
  // Same windows as the borrowing view: refresh age <=60s, head age <=120s,
  // and no head more than 60s ahead of the browser. Failed refreshes gate above.
  else if (
    now - schedules.dataUpdatedAt > 60000 ||
    now - balances.dataUpdatedAt > 60000 ||
    now / 1000 - Number(scheduleSnapshot.chainTime) > 120 ||
    Number(scheduleSnapshot.chainTime) - now / 1000 > 60
  )
    reason = 'Payment data unavailable · refresh to retry.';
  if (reason) return { reason };
  const active = activeSchedules(
    scheduleRows!,
    address!,
    scheduleSnapshot!.chainTime,
  );
  const future = scheduleRows!.filter(
    (s) =>
      s.sender.toLowerCase() === address!.toLowerCase() &&
      !s.cancelled &&
      s.start > scheduleSnapshot!.chainTime &&
      s.end > s.start &&
      s.total > 0n,
  ).length;
  const rate = paymentRatePerSecond(active);
  const funded = fundedThrough(active);
  const covered = payrollCoveredUntil(active, balances.data!.musd!);
  return {
    reason: undefined,
    active,
    future,
    rate,
    funded,
    covered,
    walletMusd: balances.data!.musd!,
  };
}
