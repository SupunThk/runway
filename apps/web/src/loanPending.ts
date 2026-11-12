import {
  isAddress,
  isHash,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import {
  borrowingWriteDeployment,
  TESTNET_CHAIN_ID,
  type LoanOperation,
} from '@runway/mezo';

export type PendingLoan = {
  version: 1;
  chainId: number;
  sender: Address;
  target: Address;
  hash: Hash;
  data: `0x${string}`;
  value: string;
  operation: LoanOperation;
  amount: string;
  debtBefore: string;
  collateralBefore: string;
  submittedAt: string;
  fundingIntentId?: string;
};
export const loanPendingKey = (owner: Address) =>
  `runway:loan:v1:${TESTNET_CHAIN_ID}:${borrowingWriteDeployment.operations.address.toLowerCase()}:${owner.toLowerCase()}`;
export function readPendingLoan(owner: Address): PendingLoan | undefined {
  const raw = localStorage.getItem(loanPendingKey(owner));
  if (!raw) return;
  let p: PendingLoan;
  try {
    p = JSON.parse(raw);
  } catch {
    throw new Error(
      'Saved loan transaction is damaged. Check your wallet and explorer before sending again.',
    );
  }
  if (
    p.version !== 1 ||
    p.chainId !== TESTNET_CHAIN_ID ||
    !isAddress(p.sender ?? '') ||
    p.sender.toLowerCase() !== owner.toLowerCase() ||
    p.target?.toLowerCase() !==
      borrowingWriteDeployment.operations.address.toLowerCase() ||
    !isHash(p.hash ?? '') ||
    !/^0x(?:[a-fA-F0-9]{2})+$/.test(p.data ?? '') ||
    ![p.value, p.amount, p.debtBefore, p.collateralBefore].every(
      (v) => typeof v === 'string' && /^\d{1,78}$/.test(v),
    ) ||
    !['open', 'borrow', 'add-collateral', 'repay'].includes(p.operation) ||
    typeof p.submittedAt !== 'string' ||
    !Number.isFinite(Date.parse(p.submittedAt)) ||
    (p.fundingIntentId !== undefined &&
      !/^[0-9a-f-]{36}$/.test(p.fundingIntentId))
  )
    throw new Error(
      'Saved loan transaction does not match this account and deployment. Check your wallet and explorer.',
    );
  return p;
}
export async function inspectLoanTransaction(
  client: PublicClient,
  pending: PendingLoan,
) {
  if ((await client.getChainId()) !== TESTNET_CHAIN_ID)
    throw new Error('Wrong RPC network.');
  const receipt = await client.getTransactionReceipt({ hash: pending.hash });
  const tx = await client.getTransaction({ hash: pending.hash });
  if (
    tx.from.toLowerCase() !== pending.sender.toLowerCase() ||
    tx.to?.toLowerCase() !== pending.target.toLowerCase() ||
    tx.input.toLowerCase() !== pending.data.toLowerCase() ||
    tx.value !== BigInt(pending.value)
  )
    return { state: 'mismatch' as const };
  const [block, head] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBlockNumber({ cacheTime: 0 }),
  ]);
  if (block.hash !== receipt.blockHash || head < receipt.blockNumber + 12n)
    return { state: 'pending' as const };
  return {
    state:
      receipt.status === 'success'
        ? ('confirmed' as const)
        : ('reverted' as const),
    blockNumber: receipt.blockNumber,
  };
}
export async function withWalletLock<T>(
  owner: Address,
  action: () => Promise<T>,
) {
  if (!navigator.locks)
    throw new Error(
      'This browser cannot coordinate wallet requests across tabs. Use a current browser on localhost or HTTPS.',
    );
  return navigator.locks.request(
    `runway:wallet:${TESTNET_CHAIN_ID}:${owner.toLowerCase()}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new Error(
          'Another Runway tab is already preparing a wallet transaction.',
        );
      return action();
    },
  );
}
