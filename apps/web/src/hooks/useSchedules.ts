import { useInfiniteQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { paymentAddress } from '../config';
import {
  readSchedulePage,
  uniqueSchedules,
  type ScheduleCursor,
} from '../schedules';
import type { useDeploymentReadiness } from './useDeploymentReadiness';
export function useSchedules({
  address,
  chainId,
  scheduleId,
  readiness,
}: {
  address?: Address;
  chainId?: number;
  scheduleId?: bigint;
  readiness: ReturnType<typeof useDeploymentReadiness>;
}) {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const schedules = useInfiniteQuery({
    queryKey: [
      'schedules',
      TESTNET_CHAIN_ID,
      client?.transport.url,
      address,
      chainId,
      paymentAddress,
      scheduleId?.toString(),
    ],
    enabled: Boolean(
      client && readiness.data?.payments && (address || scheduleId),
    ),
    initialPageParam: undefined as ScheduleCursor | undefined,
    queryFn: ({ pageParam }) =>
      readSchedulePage(
        client!,
        paymentAddress!,
        address,
        scheduleId,
        pageParam,
      ),
    getNextPageParam: (page) => page.next,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: 15000,
  });
  const scheduleRows = schedules.data
    ? uniqueSchedules(schedules.data.pages)
    : undefined;
  const scheduleSnapshot = schedules.data?.pages[0];

  const outstanding = address
    ? scheduleRows
        ?.filter((s) => s.sender.toLowerCase() === address.toLowerCase())
        .reduce(
          (sum, s) =>
            sum + (s.cancelled ? s.vestedAtCancellation : s.total) - s.claimed,
          0n,
        )
    : undefined;

  return {
    query: schedules,
    rows: scheduleRows,
    snapshot: scheduleSnapshot,
    outstanding,
  };
}
