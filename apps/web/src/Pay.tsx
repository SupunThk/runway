import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  isAddress,
  isHash,
  type Hash,
} from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';
import { apiFetch, BackendUnavailableError, readJson } from './api';
import { explorer, musdAddress, paymentAddress } from './config';
import { WalletConnection } from './WalletConnection';
import { Sidebar } from './Sidebar';
import { readPendingLoan, withWalletLock } from './loanPending';
import { usePendingTransaction } from './pending';
import { useBackendWake } from './hooks/useBackendWake';
import { BackendWakeNotice } from './BackendWakeNotice';
import { isConfirmedRevertedTransfer } from './publicTransfer';

type PublicPayment = {
  recipient: `0x${string}`;
  amountBaseUnits: string;
  publicBusinessName: string;
  publicMemo: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  transactionHash: Hash | null;
  chainId: number;
  tokenAddress: string;
  receipt: null | {
    transactionHash: Hash;
    payer: string;
    blockNumber: string;
    blockHash: Hash;
    timestamp: string;
    confirmations: string;
  };
};
const retryDelays = [0, 2000, 5000, 10000, 20000, 40000, 60000, 90000, 60000];
export function Pay() {
  const token = location.pathname.split('/')[2] ?? '',
    valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  const storageKey = `runway:pay:v1:${TESTNET_CHAIN_ID}:${token}`;
  const { address, chainId } = useAccount(),
    client = usePublicClient({ chainId: TESTNET_CHAIN_ID }),
    { data: wallet } = useWalletClient();
  const recovery = usePendingTransaction(paymentAddress);
  const [hash, setHash] = useState<Hash>(),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [storageError, setStorageError] = useState('');
  const verifying = useRef(false),
    submitting = useRef(false);
  const [revertedHash, setRevertedHash] = useState<Hash>();
  async function load() {
    const response = await apiFetch(`/api/pay/${token}`);
    const data = await readJson<PublicPayment & { error?: string }>(response);
    if (!response.ok)
      throw new Error(data.error ?? 'Payment request unavailable.');
    if (
      data.chainId !== TESTNET_CHAIN_ID ||
      data.tokenAddress.toLowerCase() !== musdAddress?.toLowerCase() ||
      !isAddress(data.recipient) ||
      !/^\d{1,78}$/.test(data.amountBaseUnits) ||
      BigInt(data.amountBaseUnits) <= 0n ||
      BigInt(data.amountBaseUnits) > (1n << 256n) - 1n ||
      !Number.isFinite(Date.parse(data.expiresAt))
    )
      throw new Error('Payment request terms could not be validated.');
    return data;
  }
  const query = useQuery({
    queryKey: ['public-payment', token],
    enabled: valid,
    queryFn: load,
    retry: false,
    refetchInterval: 30_000,
  });
  const wake = useBackendWake(async () => {
    await query.refetch();
  });
  useEffect(() => {
    if (query.error instanceof BackendUnavailableError) wake.wake();
  }, [query.error, wake.wake]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved.version !== 1 ||
          saved.chainId !== TESTNET_CHAIN_ID ||
          !isHash(saved.hash)
        )
          throw new Error();
        setHash(saved.hash);
      }
    } catch {
      setStorageError(
        'Saved payment tracking could not be read. Check your wallet and explorer before sending anything.',
      );
    }
  }, [storageKey]);
  useEffect(() => {
    if (query.data?.transactionHash && !hash)
      setHash(query.data.transactionHash);
  }, [query.data?.transactionHash, hash]);
  useEffect(() => {
    if (
      query.data?.status === 'paid' &&
      query.data.receipt &&
      recovery.pending?.hash === query.data.transactionHash
    )
      recovery.clear(query.data.transactionHash!);
  }, [query.data, recovery.pending?.hash]);
  async function verify(savedHash: Hash) {
    if (verifying.current) return;
    verifying.current = true;
    try {
      const response = await apiFetch(`/api/pay/${token}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionHash: savedHash }),
      });
      const data = await readJson<{ status?: string; error?: string }>(
        response,
      );
      if (!response.ok)
        throw new Error(data.error ?? 'Could not verify this transfer.');
      setNotice(
        data.status === 'paid'
          ? 'Payment verified after 12 block confirmations.'
          : 'Payment sent — waiting for 12 confirmations. Do not send another payment.',
      );
      await query.refetch();
      if (data.status === 'paid' && recovery.pending?.hash === savedHash)
        recovery.clear(savedHash);
    } catch (error) {
      const reverted =
        client &&
        musdAddress &&
        query.data &&
        (await isConfirmedRevertedTransfer(client, savedHash, {
          token: musdAddress,
          recipient: query.data.recipient,
          amount: BigInt(query.data.amountBaseUnits),
        }));
      if (reverted) {
        setRevertedHash(savedHash);
        setNotice(
          'This transfer reverted on the canonical chain; no MUSD was transferred. Acknowledge its result before deciding whether to retry.',
        );
      } else
        setNotice(
          (error instanceof Error
            ? error.message
            : 'Verification unavailable.') +
            ' Keep this hash and check again; do not send another payment.',
        );
      if (error instanceof BackendUnavailableError) wake.wake();
    } finally {
      verifying.current = false;
    }
  }
  useEffect(() => {
    if (
      !hash ||
      revertedHash === hash ||
      query.data?.status === 'paid' ||
      attempt >= retryDelays.length
    )
      return;
    const timer = setTimeout(() => {
      void verify(hash).finally(() => setAttempt((v) => v + 1));
    }, retryDelays[attempt]);
    return () => clearTimeout(timer);
  }, [hash, attempt, query.data?.status, revertedHash]);
  async function acknowledgeReverted() {
    if (!hash || !client || !musdAddress || !query.data || !address) return;
    const tokenContract = musdAddress;
    setBusy(true);
    try {
      await withWalletLock(address, async () => {
        if (
          !(await isConfirmedRevertedTransfer(client, hash, {
            token: tokenContract,
            recipient: query.data.recipient,
            amount: BigInt(query.data.amountBaseUnits),
          }))
        )
          throw new Error(
            'The reverted receipt could not be revalidated. Keep this hash and check again.',
          );
        if (
          (await client.getTransaction({ hash })).from.toLowerCase() !==
          address.toLowerCase()
        )
          throw new Error(
            'Connect the wallet that sent this transfer before acknowledging a retry.',
          );
        const fresh = await load();
        if (fresh.transactionHash)
          throw new Error(
            'The server already has a linked payment. Keep its receipt and contact the payee before retrying.',
          );
        const raw = localStorage.getItem(storageKey);
        if (raw && JSON.parse(raw).hash !== hash)
          throw new Error(
            'Saved payment tracking changed in another tab. Reload before continuing.',
          );
        localStorage.removeItem(storageKey);
        if (recovery.pending?.hash === hash) recovery.clear(hash);
        setHash(undefined);
        setRevertedHash(undefined);
        setAttempt(0);
        setNotice(
          'Reverted transfer acknowledged. Review the current request before any new payment.',
        );
        await query.refetch();
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not acknowledge this receipt.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNotice('');
    try {
      if (
        !address ||
        chainId !== TESTNET_CHAIN_ID ||
        !wallet ||
        !client ||
        !musdAddress ||
        !paymentAddress ||
        hash ||
        storageError
      )
        throw new Error(
          'Connect the intended payer wallet to Mezo testnet and resolve saved tracking first.',
        );
      const tokenContract = musdAddress,
        paymentsContract = paymentAddress;
      await withWalletLock(address, async () => {
        recovery.checkStorage();
        if (readPendingLoan(address) || localStorage.getItem(storageKey))
          throw new Error(
            'A saved transaction needs checking before another payment.',
          );
        localStorage.setItem(storageKey + ':probe', '1');
        localStorage.removeItem(storageKey + ':probe');
        const fresh = await load();
        if (
          fresh.status !== 'open' ||
          fresh.transactionHash ||
          Date.parse(fresh.expiresAt) <= Date.now() ||
          !query.data ||
          fresh.recipient !== query.data.recipient ||
          fresh.amountBaseUnits !== query.data.amountBaseUnits
        )
          throw new Error(
            'This request changed or is no longer open. Refresh before paying.',
          );
        const block = await client.getBlock();
        const age = Date.now() / 1000 - Number(block.timestamp);
        if (age > 120 || age < -30)
          throw new Error('Chain data is stale. Refresh before paying.');
        const amount = BigInt(fresh.amountBaseUnits),
          args = [fresh.recipient, amount] as const;
        const [balance, gasBalance, gasPrice, gas, simulation] =
          await Promise.all([
            client.readContract({
              address: tokenContract,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address],
              blockNumber: block.number,
            }),
            client.getBalance({ address, blockNumber: block.number }),
            client.getGasPrice(),
            client.estimateContractGas({
              account: address,
              address: tokenContract,
              abi: erc20Abi,
              functionName: 'transfer',
              args,
            }),
            client.simulateContract({
              account: address,
              address: tokenContract,
              abi: erc20Abi,
              functionName: 'transfer',
              args,
            }),
          ]);
        if (balance < amount)
          throw new Error(
            'Insufficient MUSD. Fund the payer wallet before continuing.',
          );
        if (gasBalance < (gas * gasPrice * 12n) / 10n)
          throw new Error(
            'Insufficient BTC for the estimated gas reserve. Add testnet BTC before continuing.',
          );
        if (!simulation.result)
          throw new Error('MUSD simulation rejected this payment.');
        if (
          (await wallet.getChainId()) !== TESTNET_CHAIN_ID ||
          (await wallet.getAddresses())[0]?.toLowerCase() !==
            address.toLowerCase()
        )
          throw new Error('Wallet account or network changed. Review again.');
        recovery.checkStorage();
        const tx = await wallet.writeContract(simulation.request);
        setHash(tx);
        setAttempt(0);
        const submittedAt = new Date().toISOString();
        recovery.save({
          version: 1,
          chainId: TESTNET_CHAIN_ID,
          contract: paymentsContract,
          sender: address,
          target: tokenContract,
          hash: tx,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args,
          }),
          action: 'Payment',
          submittedAt,
        });
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ version: 1, chainId: TESTNET_CHAIN_ID, hash: tx }),
          );
        } catch {
          setStorageError(
            'Transfer submitted but browser storage failed. Keep this hash before closing: ' +
              tx,
          );
        }
        setNotice(
          'Payment submitted. The saved hash will be verified; no further transfer is sent automatically.',
        );
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message.split('\n')[0]
          : 'Payment could not be submitted.',
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const data = query.error ? undefined : query.data;
  const blocked = !address
    ? 'Connect your payer wallet to continue.'
    : chainId !== TESTNET_CHAIN_ID
      ? 'Switch to Mezo testnet using Wallet setup.'
      : hash
        ? 'A transfer is already saved. Check its status instead of paying again.'
        : recovery.pending || recovery.error
          ? 'Resolve the saved wallet transaction on Overview first.'
          : data?.status !== 'open'
            ? 'This request is not open for a new payment.'
            : Date.parse(data.expiresAt) <= Date.now()
              ? 'This request has expired. Do not send a new transfer.'
              : storageError || undefined;
  return (
    <div className="shell">
      <Sidebar />
      <main>
        <header className="topbar">
          <span>CLIENT PAYMENT</span>
          <div className="wallet-tools">
            <span className="badge">TESTNET ONLY</span>
            <WalletConnection onNotice={setNotice} />
          </div>
        </header>
        <div className="content public-payment">
          <h1>Pay with MUSD</h1>
          <BackendWakeNotice wake={wake} />
          {!valid ? (
            <p role="alert">Payment request not found.</p>
          ) : query.error ? (
            <p className="callout warning" role="alert">
              {query.error.message}{' '}
              <button onClick={() => void query.refetch()}>
                Retry payment page
              </button>
            </p>
          ) : query.isPending ? (
            <p role="status">Loading payment request…</p>
          ) : null}
          {data ? (
            <section className="panel" aria-label="Client payment details">
              <span className="eyebrow">{data.publicBusinessName}</span>
              <h2>{formatUnits(BigInt(data.amountBaseUnits), 18)} MUSD</h2>
              <p>{data.publicMemo}</p>
              <p className="mono">Payee: {data.recipient}</p>
              <p>
                Expires {data.expiresAt} ·{' '}
                <strong>{data.status.replaceAll('_', ' ')}</strong>
              </p>
              <p>
                MUSD goes directly to the displayed payee. Confirm the address
                and amount; a confirmed transfer cannot be cancelled. A transfer
                must be mined before expiry to settle this request.
              </p>
              {data.status !== 'paid' ? (
                <>
                  <button
                    className="button"
                    disabled={Boolean(blocked) || busy}
                    onClick={() => void pay()}
                  >
                    {busy ? 'Waiting for wallet…' : 'Pay exact MUSD amount'}
                  </button>
                  {blocked ? (
                    <p className="hint" role="status">
                      {blocked}
                    </p>
                  ) : null}
                </>
              ) : (
                <p role="status">Payment received and verified.</p>
              )}
              {data.receipt && data.status === 'paid' ? (
                <>
                  <p>
                    Paid by <span className="mono">{data.receipt.payer}</span> ·
                    block {data.receipt.blockNumber}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            {
                              chainId: data.chainId,
                              token: data.tokenAddress,
                              recipient: data.recipient,
                              amountBaseUnits: data.amountBaseUnits,
                              receipt: data.receipt,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: 'application/json' },
                      );
                      const url = URL.createObjectURL(blob),
                        a = document.createElement('a');
                      a.href = url;
                      a.download = 'runway-payment-receipt.json';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Download verified receipt
                  </button>
                </>
              ) : null}
            </section>
          ) : null}
          {storageError ? (
            <p className="callout warning" role="alert">
              {storageError}
            </p>
          ) : null}
          {notice ? (
            <p className="callout" role="status">
              {notice}
            </p>
          ) : null}
          {hash ? (
            <section className="callout" aria-label="Saved client payment">
              <h2>Saved payment transaction</h2>
              <p className="mono">{hash}</p>
              <a
                href={`${explorer}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transfer receipt
              </a>
              <p>
                Verification waits for 12 block confirmations. Reloading checks
                this same hash and never opens another transfer prompt.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void verify(hash)}
              >
                Check payment again
              </button>
              {revertedHash === hash ? (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void acknowledgeReverted()}
                >
                  Acknowledge reverted transfer
                </button>
              ) : null}
              {attempt >= retryDelays.length ? (
                <p>
                  Automatic checks paused after about five minutes. Use Check
                  payment again.
                </p>
              ) : null}
            </section>
          ) : null}
          {valid && data?.status !== 'paid' ? (
            <details>
              <summary>Recover a transfer already sent</summary>
              <p>
                Paste its transaction hash. This only verifies a transfer; it
                never sends MUSD.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = String(
                    new FormData(e.currentTarget).get('hash'),
                  );
                  if (!isHash(value)) {
                    setNotice('Enter a valid transaction hash.');
                    return;
                  }
                  setHash(value);
                  setAttempt(retryDelays.length);
                  try {
                    localStorage.setItem(
                      storageKey,
                      JSON.stringify({
                        version: 1,
                        chainId: TESTNET_CHAIN_ID,
                        hash: value,
                      }),
                    );
                  } catch {
                    setStorageError(
                      'Storage unavailable. Keep this hash before closing.',
                    );
                  }
                  void verify(value);
                }}
              >
                <label>
                  Existing payment transaction hash
                  <input name="hash" required />
                </label>
                <button className="button secondary">
                  Verify existing transfer
                </button>
              </form>
            </details>
          ) : null}
          <p className="hint">
            Direct onchain MUSD transfers on Mezo testnet are public. Runway
            does not custody these funds. A shared link accepts one settlement
            record; coordinate with the payee if someone else may already be
            paying it. Keep the link private if its memo is sensitive.
          </p>
        </div>
      </main>
    </div>
  );
}
