import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  DEFAULT_SCHEDULE_FEE,
  readScheduleFeeConfig,
  scheduleFee,
  TESTNET_CHAIN_ID,
  type ScheduleFeeConfig,
} from '@runway/mezo';
import { paymentAddress } from '../config';

/** Live RunwayPayments fee terms; falls back to the published default for display only. */
export function useScheduleFee() {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const query = useQuery({
    queryKey: ['schedule-fee', paymentAddress],
    enabled: Boolean(client && paymentAddress),
    staleTime: 60_000,
    retry: false,
    queryFn: () => readScheduleFeeConfig(client!, paymentAddress!),
  });
  const config: ScheduleFeeConfig = query.data ?? DEFAULT_SCHEDULE_FEE;
  return {
    query,
    /** True once the deployed contract is confirmed to charge the fee. */
    live: Boolean(query.data?.supported),
    /** True when the deployed contract predates fees and charges nothing. */
    legacy: query.data?.supported === false,
    config,
    feeFor: (amount: bigint) =>
      query.data?.supported === false ? 0n : scheduleFee(amount, config),
  };
}
