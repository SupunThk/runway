import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';

/** Only a canonical failed transfer permits explicit local retry acknowledgement. */
export async function isConfirmedRevertedTransfer(
  client: PublicClient,
  hash: Hash,
  terms: { token: Address; recipient: Address; amount: bigint },
) {
  try {
    if ((await client.getChainId()) !== TESTNET_CHAIN_ID) return false;
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash }),
      client.getTransaction({ hash }),
    ]);
    if (
      receipt.status !== 'reverted' ||
      tx.to?.toLowerCase() !== terms.token.toLowerCase() ||
      tx.value !== 0n ||
      tx.input.toLowerCase() !==
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [terms.recipient, terms.amount],
        }).toLowerCase()
    )
      return false;
    const head = await client.getBlockNumber({ cacheTime: 0 });
    const [block, tip] = await Promise.all([
      client.getBlock({ blockNumber: receipt.blockNumber }),
      client.getBlock({ blockNumber: head }),
    ]);
    const age = Date.now() / 1000 - Number(tip.timestamp);
    return (
      age <= 120 &&
      age >= -30 &&
      block.hash === receipt.blockHash &&
      head >= receipt.blockNumber + 12n
    );
  } catch {
    return false;
  }
}
