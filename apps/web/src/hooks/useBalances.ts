import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { erc20Abi, type Address } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { mezoTokenAddress, musdAddress } from '../config';
import {
  useMezoToken,
  type useDeploymentReadiness,
} from './useDeploymentReadiness';
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
  const mezoToken = useMezoToken(
    Boolean(address && chainId === TESTNET_CHAIN_ID),
  );
  const balances = useQuery({
    queryKey: [
      'balances',
      address,
      chainId,
      musdAddress,
      mezoTokenAddress,
      mezoToken.isSuccess,
    ],
    enabled: Boolean(address && client && readiness.isSuccess),
    queryFn: async () => {
      const block = await client!.getBlockNumber();
      const [btc, musd, mezo] = await Promise.all([
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
        mezoToken.isSuccess
          ? client!
              .readContract({
                address: mezoTokenAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [address!],
                blockNumber: block,
              })
              .catch(() => undefined)
          : undefined,
      ]);
      return { btc, musd, mezo, block };
    },
    refetchInterval: 15000,
  });

  return balances;
}
