import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { readBorrowingPosition, TESTNET_CHAIN_ID } from '@runway/mezo';
import { musdAddress } from '../config';

export function useBorrowingPosition(account?: Address) {
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: [
      'borrowing',
      TESTNET_CHAIN_ID,
      client?.transport.url,
      account,
      musdAddress,
    ],
    enabled: Boolean(account && client && musdAddress),
    queryFn: () => readBorrowingPosition(client!, account!, musdAddress!),
    retry: false,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const data = query.data;
  const stale = Boolean(
    data &&
    (now - query.dataUpdatedAt > 60000 ||
      now / 1000 - Number(data.chainTime) > 120 ||
      Number(data.chainTime) - now / 1000 > 60),
  );
  const price = data?.active && !query.error && !stale ? data.price : undefined;
  return { query, data, stale, price };
}
