import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { erc20Abi, type Address } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { musdAddress } from '../config';
import type { useDeploymentReadiness } from './useDeploymentReadiness';
export function useBalances({
  address,
  chainId,
  readiness,
}: {
  address?: Address;
  chainId?: number;
  readiness: ReturnType<typeof useDeploymentReadiness>;
}) {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
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

  return balances;
}
