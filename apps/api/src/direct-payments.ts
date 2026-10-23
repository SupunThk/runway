import {
  createPublicClient,
  http,
  decodeFunctionData,
  erc20Abi,
  parseEventLogs,
  TransactionReceiptNotFoundError,
  TransactionNotFoundError,
  type Hash,
  type Log,
} from 'viem';
import { paymentDeployment } from './reconciliation.ts';

export type DirectInvoice = {
  recipient: string;
  amountBaseUnits: string;
  createdAt: string;
};
export type DirectStatus =
  'paid' | 'awaiting_confirmation' | 'invalid' | 'unavailable';
export type DirectVerifier = (
  hash: Hash,
  invoice: DirectInvoice,
  owner: string,
  now: Date,
) => Promise<DirectStatus>;
export interface DirectSource {
  getChainId(): Promise<number>;
  getTransaction(args: { hash: Hash }): Promise<{
    from: string;
    to: string | null;
    input: `0x${string}`;
    value: bigint;
  }>;
  getTransactionReceipt(args: { hash: Hash }): Promise<{
    status: string;
    blockNumber: bigint;
    blockHash: Hash;
    logs: Log[];
  }>;
  getBlockNumber(): Promise<bigint>;
  getBlock(args: {
    blockNumber: bigint;
  }): Promise<{ hash: Hash | null; timestamp: bigint }>;
}
export function directPaymentVerifier(source?: DirectSource): DirectVerifier {
  const client =
    source ??
    createPublicClient({
      transport: http(
        process.env.INDEXER_RPC_URL || 'https://rpc.test.mezo.org',
        { timeout: 15000, retryCount: 1 },
      ),
    });
  return async (hash, invoice, owner, now) => {
    try {
      if ((await client.getChainId()) !== paymentDeployment.chainId)
        return 'unavailable';
      const tx = await client.getTransaction({ hash });
      if (
        tx.from.toLowerCase() !== owner.toLowerCase() ||
        tx.to?.toLowerCase() !== paymentDeployment.token ||
        tx.value !== 0n
      )
        return 'invalid';
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
      if (
        decoded.functionName !== 'transfer' ||
        decoded.args[0].toLowerCase() !== invoice.recipient.toLowerCase() ||
        decoded.args[1].toString() !== invoice.amountBaseUnits
      )
        return 'invalid';
      let receipt;
      try {
        receipt = await client.getTransactionReceipt({ hash });
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError)
          return 'awaiting_confirmation';
        throw error;
      }
      if (receipt.status !== 'success') return 'invalid';
      const [head, block] = await Promise.all([
        client.getBlockNumber(),
        client.getBlock({ blockNumber: receipt.blockNumber }),
      ]);
      const tip = await client.getBlock({ blockNumber: head });
      const age = BigInt(Math.floor(now.getTime() / 1000)) - tip.timestamp;
      if (age > 300n || age < -30n) return 'unavailable';
      if (block.hash !== receipt.blockHash) return 'awaiting_confirmation';
      if (
        block.timestamp <
        BigInt(Math.floor(Date.parse(invoice.createdAt) / 1000))
      )
        return 'invalid';
      const transfers = parseEventLogs({
        abi: erc20Abi,
        eventName: 'Transfer',
        logs: receipt.logs.filter(
          (log) => log.address.toLowerCase() === paymentDeployment.token,
        ),
      });
      if (
        !transfers.some(
          (log) =>
            log.args.from.toLowerCase() === owner.toLowerCase() &&
            log.args.to.toLowerCase() === invoice.recipient.toLowerCase() &&
            log.args.value.toString() === invoice.amountBaseUnits,
        )
      )
        return 'invalid';
      return head - receipt.blockNumber >= 12n
        ? 'paid'
        : 'awaiting_confirmation';
    } catch (error) {
      if (error instanceof TransactionNotFoundError) return 'invalid';
      return 'unavailable';
    }
  };
}
