import { useId, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { numberToHex, type EIP1193Provider } from 'viem';
import { mezoTestnet } from '@runway/mezo';
import { chainConfigValid, musdAddress } from './config';

export function WalletSetup() {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const { connector, chainId } = useAccount();

  async function setup(token = false) {
    if (!connector || pending) return;
    setPending(true);
    setNotice('Check your wallet to confirm the request.');
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      if (token) {
        const activeChain = await provider.request({ method: 'eth_chainId' });
        if (Number(activeChain) !== mezoTestnet.id) {
          setNotice('Switch to Mezo testnet before adding MUSD.');
          return;
        }
        if (!musdAddress)
          throw new Error('MUSD is not configured in this app.');
        const accepted = await provider.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20',
            options: { address: musdAddress, symbol: 'MUSD', decimals: 18 },
          },
        });
        setNotice(
          accepted === true
            ? 'MUSD request accepted. Check your wallet’s token list to finish adding it.'
            : 'MUSD was not added. You can try again or import it manually below.',
        );
      } else {
        const params: [{ chainId: string }] = [
          { chainId: numberToHex(mezoTestnet.id) },
        ];
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params,
          });
        } catch (error) {
          const rpcError = error as {
            code?: number;
            data?: { originalError?: { code?: number } };
          };
          if (
            rpcError.code !== 4902 &&
            rpcError.data?.originalError?.code !== 4902
          )
            throw error;
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                ...params[0],
                chainName: mezoTestnet.name,
                nativeCurrency: mezoTestnet.nativeCurrency,
                rpcUrls: [...mezoTestnet.rpcUrls.default.http],
                blockExplorerUrls: [mezoTestnet.blockExplorers.default.url],
              },
            ],
          });
          if (
            Number(await provider.request({ method: 'eth_chainId' })) !==
            mezoTestnet.id
          )
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params,
            });
        }
        if (
          Number(await provider.request({ method: 'eth_chainId' })) !==
          mezoTestnet.id
        )
          throw new Error('Wallet did not switch to Mezo testnet.');
        setNotice(
          'Mezo testnet selected. You can now add MUSD to your wallet.',
        );
      }
    } catch (error) {
      const code =
        (error as { code?: number; cause?: { code?: number } })?.code ??
        (error as { cause?: { code?: number } })?.cause?.code;
      setNotice(
        code === 4001
          ? 'Request declined. You can try again whenever you’re ready.'
          : 'The wallet could not complete setup. You can try again or use the manual settings below.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="wallet-picker wallet-setup"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="button secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        Wallet setup
      </button>
      {open && (
        <section
          id={id}
          className="wallet-options wallet-setup-panel"
          aria-label="Wallet setup"
        >
          <div className="section-heading">
            <strong>Set up Mezo testnet</strong>
            <button
              className="text-button"
              aria-label="Close wallet setup"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              ×
            </button>
          </div>
          <p>
            Add the network first, then show MUSD in your wallet. Your wallet
            asks you to confirm. No funds move or gas is spent.
          </p>
          <button
            className="button wallet-option"
            disabled={pending || !chainConfigValid}
            onClick={() => void setup()}
          >
            Add / switch Mezo testnet
          </button>
          <button
            className="button secondary wallet-option"
            disabled={
              pending ||
              !chainConfigValid ||
              !musdAddress ||
              chainId !== mezoTestnet.id
            }
            onClick={() => void setup(true)}
          >
            Add MUSD to wallet
          </button>
          {chainId !== mezoTestnet.id && (
            <p>Select Mezo testnet to enable token import.</p>
          )}
          {!musdAddress && <p>MUSD is not configured in this app.</p>}
          {notice && (
            <p className="wallet-setup-notice" role="status">
              {notice}
            </p>
          )}
          <details>
            <summary>Manual network & token settings</summary>
            <dl>
              <dt>Network name</dt>
              <dd>{mezoTestnet.name}</dd>
              <dt>Chain ID</dt>
              <dd>{mezoTestnet.id}</dd>
              <dt>RPC URL</dt>
              <dd>{mezoTestnet.rpcUrls.default.http[0]}</dd>
              <dt>Gas currency</dt>
              <dd>BTC · 18 decimals</dd>
              <dt>Block explorer</dt>
              <dd>{mezoTestnet.blockExplorers.default.url}</dd>
              <dt>MUSD contract</dt>
              <dd>{musdAddress ?? 'Not configured'}</dd>
              <dt>Token symbol / decimals</dt>
              <dd>MUSD / 18</dd>
            </dl>
            <p>
              Adding MUSD shows a token you already hold. It does not mint or
              buy tokens.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
