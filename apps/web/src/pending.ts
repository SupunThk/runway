import { useEffect, useState } from 'react';
import { isAddress, isHash, type Address, type Hash } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';

export type PendingTransaction = {
  version: 1;
  chainId: number;
  contract: Address;
  sender: Address;
  target: Address;
  hash: Hash;
  data: `0x${string}`;
  action: 'Approval' | 'Funding' | 'Claim' | 'Cancellation' | 'Payment';
  scheduleId?: string;
  submittedAt: string;
};
export function pendingKey(contract: Address) {
  return `runway:pending:v1:${TESTNET_CHAIN_ID}:${contract.toLowerCase()}`;
}
function readPending(contract: Address): PendingTransaction | undefined {
  const raw = localStorage.getItem(pendingKey(contract));
  if (!raw) return;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'Saved transaction data is damaged. Check your wallet and explorer before removing its tracking record.',
    );
  }
  if (
    value.version !== 1 ||
    value.chainId !== TESTNET_CHAIN_ID ||
    value.contract?.toLowerCase() !== contract.toLowerCase() ||
    !isAddress(value.sender ?? '') ||
    !isAddress(value.target ?? '') ||
    !isHash(value.hash ?? '') ||
    !/^0x([a-fA-F0-9]{2})+$/.test(value.data ?? '') ||
    !['Approval', 'Funding', 'Claim', 'Cancellation', 'Payment'].includes(
      value.action,
    ) ||
    (value.scheduleId !== undefined && !/^[1-9]\d*$/.test(value.scheduleId)) ||
    typeof value.submittedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.submittedAt))
  )
    throw new Error(
      'Saved transaction data could not be read. Check this site’s stored transaction before submitting again.',
    );
  return value;
}
export function usePendingTransaction(contract: Address | undefined) {
  const load = () => {
    try {
      return {
        pending: contract ? readPending(contract) : undefined,
        error: '',
      };
    } catch (error) {
      return {
        pending: undefined,
        error:
          error instanceof Error
            ? error.message
            : 'Browser storage unavailable.',
      };
    }
  };
  const [state, setState] = useState(load);
  useEffect(() => {
    const listener = () => setState(load());
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [contract]);
  function checkStorage() {
    if (!contract) throw new Error('Payment contract unavailable.');
    // Re-read at signing time to catch transactions submitted in another tab.
    if (readPending(contract))
      throw new Error('Check the saved transaction before submitting another.');
    const probe = `${pendingKey(contract)}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  }
  function save(pending: PendingTransaction) {
    setState({ pending, error: '' });
    try {
      localStorage.setItem(
        pendingKey(pending.contract),
        JSON.stringify(pending),
      );
    } catch {
      setState({
        pending,
        error:
          'Transaction submitted, but browser storage failed. Keep this transaction hash before closing this tab.',
      });
    }
  }
  function clear(hash: Hash) {
    if (!contract) return;
    try {
      if (readPending(contract)?.hash === hash)
        localStorage.removeItem(pendingKey(contract));
      setState((current) =>
        current.pending?.hash === hash
          ? { pending: undefined, error: '' }
          : current,
      );
    } catch {
      setState((current) => ({
        ...current,
        error:
          'Could not clear saved transaction. Browser storage is unavailable.',
      }));
    }
  }
  function resetDamagedRecord() {
    if (!contract) return;
    try {
      localStorage.removeItem(pendingKey(contract));
      setState({ pending: undefined, error: '' });
    } catch {
      setState((current) => ({
        ...current,
        error:
          'Browser storage is unavailable. Enable storage for this site and reload before submitting a transaction.',
      }));
    }
  }
  return { ...state, checkStorage, save, clear, resetDamagedRecord };
}
