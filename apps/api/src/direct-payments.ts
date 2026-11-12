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
  expiresAt?: string;
};
export type TransferEvidence = {
  status: DirectStatus;
  verified: boolean;
  payer?: string;
  blockNumber?: string;
  blockHash?: Hash;
  timestamp?: string;
  confirmations?: string;
};
export type TransferVerifier = (
  hash: Hash,
  payment: DirectInvoice,
  now: Date,
) => Promise<TransferEvidence>;
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
  getBlockNumber(args?: { cacheTime?: number }): Promise<bigint>;
  getBlock(args: {
    blockNumber: bigint;
  }): Promise<{ hash: Hash | null; timestamp: bigint }>;
}
function transferReader(source?: DirectSource) {
  const client =
    source ??
    createPublicClient({
      transport: http(
        process.env.INDEXER_RPC_URL || 'https://rpc.test.mezo.org',
        { timeout: 15000, retryCount: 1 },
      ),
    });
  return async (
    hash: Hash,
    invoice: DirectInvoice,
    now: Date,
    owner?: string,
  ): Promise<TransferEvidence> => {
    const result = (status: DirectStatus): TransferEvidence => ({
      status,
      verified: false,
    });
    try {
      if ((await client.getChainId()) !== paymentDeployment.chainId)
        return result('unavailable');
      const tx = await client.getTransaction({ hash });
      if (
        (owner !== undefined &&
          tx.from.toLowerCase() !== owner.toLowerCase()) ||
        tx.to?.toLowerCase() !== paymentDeployment.token ||
        tx.value !== 0n
      )
        return result('invalid');
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
      if (
        decoded.functionName !== 'transfer' ||
        decoded.args[0].toLowerCase() !== invoice.recipient.toLowerCase() ||
        decoded.args[1].toString() !== invoice.amountBaseUnits
      )
        return result('invalid');
      let receipt;
      try {
        receipt = await client.getTransactionReceipt({ hash });
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError)
          return result('awaiting_confirmation');
        throw error;
      }
      if (receipt.status !== 'success') return result('invalid');
      const [head, block] = await Promise.all([
        client.getBlockNumber({ cacheTime: 0 }),
        client.getBlock({ blockNumber: receipt.blockNumber }),
      ]);
      if (head < receipt.blockNumber) return result('unavailable');
      const tip = await client.getBlock({ blockNumber: head });
      const age = BigInt(Math.floor(now.getTime() / 1000)) - tip.timestamp;
      if (age > 300n || age < -30n) return result('unavailable');
      if (block.hash !== receipt.blockHash)
        return result('awaiting_confirmation');
      if (
        block.timestamp <
          BigInt(Math.floor(Date.parse(invoice.createdAt) / 1000)) ||
        (invoice.expiresAt !== undefined &&
          block.timestamp >=
            BigInt(Math.floor(Date.parse(invoice.expiresAt) / 1000)))
      )
        return result('invalid');
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
            log.args.from.toLowerCase() === tx.from.toLowerCase() &&
            log.args.to.toLowerCase() === invoice.recipient.toLowerCase() &&
            log.args.value.toString() === invoice.amountBaseUnits,
        )
      )
        return result('invalid');
      return {
        status:
          head - receipt.blockNumber >= 12n ? 'paid' : 'awaiting_confirmation',
        verified: true,
        payer: tx.from.toLowerCase(),
        blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        confirmations: (head > receipt.blockNumber
          ? head - receipt.blockNumber
          : 0n
        ).toString(),
      };
    } catch (error) {
      if (error instanceof TransactionNotFoundError) return result('invalid');
      return result('unavailable');
    }
  };
}
export function directPaymentVerifier(source?: DirectSource): DirectVerifier {
  const read = transferReader(source);
  return async (hash, invoice, owner, now) =>
    (await read(hash, invoice, now, owner)).status;
}
export function paymentRequestVerifier(
  source?: DirectSource,
): TransferVerifier {
  const read = transferReader(source);
  return (hash, payment, now) => read(hash, payment, now);
}
