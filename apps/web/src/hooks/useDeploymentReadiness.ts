import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { erc20Abi, getAddress } from 'viem';
import {
  MEZO_TESTNET_TOKEN,
  paymentsAbi,
  TESTNET_CHAIN_ID,
} from '@runway/mezo';
import {
  chainConfigValid,
  mezoTokenAddress,
  musdAddress,
  paymentAddress,
} from '../config';

export function useMezoToken(enabled: boolean) {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  return useQuery({
    queryKey: ['mezo-token', mezoTokenAddress],
    enabled: Boolean(enabled && client),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const [chainId, code, symbol, decimals] = await Promise.all([
        client!.getChainId(),
        client!.getCode({ address: mezoTokenAddress }),
        client!.readContract({
          address: mezoTokenAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        }),
        client!.readContract({
          address: mezoTokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      ]);
      // The verified native precompile is identified by chain and address;
      // empty bytecode alone cannot establish that a precompile is missing.
      const native = mezoTokenAddress === MEZO_TESTNET_TOKEN;
      if (
        chainId !== TESTNET_CHAIN_ID ||
        symbol !== 'MEZO' ||
        decimals !== 18 ||
        (!native && (!code || code === '0x'))
      )
        throw new Error('Configured MEZO token failed validation.');
      return { decimals };
    },
  });
}
export function useDeploymentReadiness() {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
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

  return readiness;
}
