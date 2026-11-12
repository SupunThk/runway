import { useState } from 'react';
import type { Address } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';

export function PaymentChecklist({
  address,
  chainId,
  walletFunded,
  scheduleId,
}: {
  address?: Address;
  chainId?: number;
  walletFunded: boolean;
  scheduleId?: bigint;
}) {
  const [notice, setNotice] = useState('');
  const connected = Boolean(address && chainId === TESTNET_CHAIN_ID);
  return (
    <section className="payment-checklist" aria-label="Payment task checklist">
      <h2>Your next payment</h2>
      <ol>
        <li>
          <span>{connected ? '✓' : '1'}</span>Connect to Mezo testnet
          {!connected ? (
            <small>Use Connect wallet and Wallet setup above.</small>
          ) : null}
        </li>
        <li>
          <span>{connected && walletFunded ? '✓' : '2'}</span>Fund your wallet
          {connected && !walletFunded ? (
            <small>
              Keep MUSD for payment and BTC for gas.{' '}
              <a href="/borrowing">Review borrowing</a>.
            </small>
          ) : null}
        </li>
        <li>
          <span>{scheduleId ? '✓' : '3'}</span>
          <a href="/?create=1">Create a payment</a>
        </li>
        <li>
          <span>4</span>
          {scheduleId ? (
            <button
              className="text-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${location.origin}/schedules/${scheduleId}`)
                  .then(
                    () => setNotice('Recipient link copied.'),
                    () =>
                      setNotice(
                        'Copy failed. Open the payment and copy its address.',
                      ),
                  );
              }}
            >
              Copy recipient link
            </button>
          ) : (
            'Share its recipient link after confirmation'
          )}
        </li>
      </ol>
      {address ? (
        <a href={`/proof/${address}`}>View public funding proof</a>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
