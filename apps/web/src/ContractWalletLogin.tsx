import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { teamRequest } from './teamApi';

export function ContractWalletLogin({
  connectedWallet,
}: {
  connectedWallet?: string;
}) {
  const cache = useQueryClient();
  const [challenge, setChallenge] = useState<{
    nonce: string;
    message: string;
    expiresAt: string;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="contract-wallet-login">
      <summary>Sign in with a contract wallet or multisig</summary>
      <p>
        Connect the contract wallet as your active wallet. Generate a login
        message, obtain the fully approved signature through your wallet, then
        paste it here. Runway verifies ERC-1271 on Mezo testnet and rechecks the
        signature during the session. An individual owner signature does not
        grant the multisig's identity. Wallet transaction execution still
        depends on your wallet's supported connector.
      </p>
      <button
        className="button secondary"
        disabled={busy || !connectedWallet}
        onClick={async () => {
          setBusy(true);
          setNotice('');
          try {
            setChallenge(
              await teamRequest('/auth/challenge', {
                address: connectedWallet,
                kind: 'contract',
              }),
            );
          } catch (e) {
            setNotice(
              e instanceof Error ? e.message : 'Could not prepare login.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Create contract-wallet login request
      </button>
      {challenge ? (
        <>
          <label>
            Contract-wallet login message
            <textarea value={challenge.message} readOnly rows={10} />
          </label>
          <p>
            Expires {new Date(challenge.expiresAt).toLocaleTimeString()}. A
            login signature grants workspace access, not permission to spend.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const signature = String(
                new FormData(e.currentTarget).get('signature'),
              );
              setBusy(true);
              setNotice('');
              try {
                await teamRequest('/auth/verify', {
                  nonce: challenge.nonce,
                  signature,
                });
                setChallenge(null);
                await cache.invalidateQueries({
                  queryKey: ['workspace-session'],
                });
              } catch (error) {
                setNotice(
                  error instanceof Error
                    ? error.message
                    : 'Contract-wallet verification failed.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Fully approved contract-wallet signature
              <textarea name="signature" maxLength={8194} required />
            </label>
            <button className="button secondary" disabled={busy}>
              Verify contract-wallet login
            </button>
          </form>
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </details>
  );
}
