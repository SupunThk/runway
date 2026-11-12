import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import {
  findFundingIntent,
  readFundingIntents,
  type FundingIntent,
} from '../fundingIntent';

export function useFundingIntent() {
  const { address } = useAccount();
  const id = new URLSearchParams(location.search).get('intent');
  const [state, setState] = useState<{
    intent?: FundingIntent;
    saved: FundingIntent[];
    error?: string;
  }>({ saved: [] });
  useEffect(() => {
    function reload() {
      if (!address) {
        setState({ saved: [] });
        return;
      }
      try {
        setState({
          saved: readFundingIntents(address),
          intent: id ? findFundingIntent(address, id) : undefined,
        });
      } catch (error) {
        setState({
          saved: [],
          error:
            error instanceof Error
              ? error.message
              : 'Funding-plan storage unavailable.',
        });
      }
    }
    reload();
    window.addEventListener('storage', reload);
    window.addEventListener('runway-funding-intent', reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener('runway-funding-intent', reload);
    };
  }, [address, id]);
  return { ...state, requested: Boolean(id), address };
}
