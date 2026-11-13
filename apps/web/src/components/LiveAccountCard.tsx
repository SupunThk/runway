import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { paymentAddress } from '../config';
import { amount } from '../format';
import { readSchedulePage } from '../schedules';
import { recipientSummary } from './RecipientEarnings';

/**
 * When Ask Runway declines a live-data question, show the connected wallet's
 * public onchain position instead. Read directly from the chain in the
 * browser: nothing is sent to the assistant or the server.
 */
export function LiveAccountCard() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const position = useQuery({
    queryKey: ['assistant-live-account', address, paymentAddress],
    enabled: Boolean(address && client && paymentAddress),
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const page = await readSchedulePage(client!, paymentAddress!, address);
      const received = recipientSummary(page.rows, address!);
      const sent = page.rows.filter(
        (r) => r.sender.toLowerCase() === address!.toLowerCase(),
      );
      const outstanding = sent.reduce(
        (sum, s) =>
          sum + (s.cancelled ? s.vestedAtCancellation : s.total) - s.claimed,
        0n,
      );
      return {
        received,
        sentCount: sent.length,
        outstanding,
        partial: Boolean(page.next),
        block: page.blockNumber,
      };
    },
  });
  if (!paymentAddress) return null;
  return (
    <aside className="live-account" aria-label="Your live onchain position">
      <span className="eyebrow">YOUR WALLET · READ FROM MEZO TESTNET</span>
      {!address ? (
        <p>
          Connect a wallet on the <a href="/">payments page</a> to see your
          schedules here. The assistant itself never sees wallet data.
        </p>
      ) : position.isPending ? (
        <p role="status">Reading your schedules from the chain…</p>
      ) : position.error || !position.data ? (
        <p>
          Your schedules could not be read right now.{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => void position.refetch()}
          >
            Retry
          </button>
        </p>
      ) : (
        <>
          <dl>
            <div>
              <dt>Claimable now</dt>
              <dd>{amount(position.data.received.claimable, 18)} MUSD</dd>
            </div>
            <div>
              <dt>Still vesting to you</dt>
              <dd>{amount(position.data.received.vesting, 18)} MUSD</dd>
            </div>
            <div>
              <dt>Your sent schedules</dt>
              <dd>
                {position.data.sentCount} ·{' '}
                {amount(position.data.outstanding, 18)} MUSD outstanding
              </dd>
            </div>
          </dl>
          <p className="hint">
            Block {position.data.block.toString()}
            {position.data.partial
              ? ' · first 20 sent and 20 received schedules only'
              : ''}
            . <a href="/">Open payments</a> to claim or manage schedules.
          </p>
        </>
      )}
    </aside>
  );
}
