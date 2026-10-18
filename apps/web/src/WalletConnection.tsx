import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { WalletSetup } from './WalletSetup';

export function WalletConnection({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { address, connector: connectedWallet } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const available = useQuery({
    queryKey: [
      'available-wallets',
      ...connectors.map((connector) => connector.uid),
    ],
    enabled: open,
    queryFn: async () => {
      // Prefer named EIP-6963 announcements over legacy aliases of the same provider.
      const candidates = [...connectors].sort((a, b) => {
        const rank = (id: string) =>
          id === 'injected' ? 2 : id.includes('.') ? 0 : 1;
        return rank(a.id) - rank(b.id);
      });
      const detected = await Promise.all(
        candidates.map(async (connector) => {
          try {
            return { connector, provider: await connector.getProvider() };
          } catch {
            return { connector, provider: undefined };
          }
        }),
      );
      const seen = new Set<unknown>();
      return detected
        .filter(({ provider }) => {
          if (!provider || seen.has(provider)) return false;
          seen.add(provider);
          return true;
        })
        .map(({ connector }) => connector);
    },
    staleTime: 0,
  });

  if (address)
    return (
      <div className="connected-wallet-tools">
        <WalletSetup key={connectedWallet?.uid + address} />
        <button
          className="button secondary"
          title={address}
          onClick={() => disconnect()}
        >
          {connectedWallet?.name === 'Injected'
            ? 'Browser wallet'
            : connectedWallet?.name}{' '}
          · {address.slice(0, 6)}…{address.slice(-4)} · Disconnect
        </button>
      </div>
    );

  return (
    <div
      className="wallet-picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>('.wallet-trigger')
            ?.focus();
        }
      }}
    >
      <button
        className="button wallet-trigger"
        aria-expanded={open}
        aria-controls="wallet-options"
        disabled={isPending}
        onClick={() => setOpen((value) => !value)}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
      {open ? (
        <div
          id="wallet-options"
          className="wallet-options"
          role="group"
          aria-label="Choose wallet"
        >
          <div className="section-heading">
            <strong>Choose your wallet</strong>
            <button
              className="text-button"
              aria-label="Close wallet picker"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <p>Select an installed EVM browser wallet.</p>
          {available.isPending ? (
            <p role="status">Detecting wallets…</p>
          ) : available.data?.length ? (
            available.data.map((connector) => (
              <button
                key={connector.uid}
                className="button secondary wallet-option"
                disabled={isPending}
                onClick={async () => {
                  try {
                    onNotice('');
                    await connectAsync({ connector });
                    setOpen(false);
                  } catch (error) {
                    onNotice(
                      error instanceof Error
                        ? error.message.split('\n')[0]
                        : 'Connection failed. Please try again.',
                    );
                  }
                }}
              >
                {connector.name === 'Injected'
                  ? 'Browser wallet'
                  : connector.name}
              </button>
            ))
          ) : (
            <p role="status">
              Install or unlock Rabby, MetaMask, or another EVM browser wallet,
              then refresh.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
