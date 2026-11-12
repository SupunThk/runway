import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { readLoanSnapshot, TESTNET_CHAIN_ID } from '@runway/mezo';
import { musdAddress } from '../config';
export function useProtocolSnapshot(enabled = true) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  return useQuery({
    queryKey: ['loan-actions', address, chainId, musdAddress],
    enabled: Boolean(
      enabled &&
      address &&
      chainId === TESTNET_CHAIN_ID &&
      client &&
      musdAddress,
    ),
    queryFn: () => readLoanSnapshot(client!, address!, musdAddress!),
    retry: false,
    refetchInterval: 30_000,
  });
}
