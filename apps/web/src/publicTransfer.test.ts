import { describe, expect, it } from 'vitest';
import {
  encodeFunctionData,
  erc20Abi,
  zeroHash,
  type Hash,
  type PublicClient,
} from 'viem';
import { isConfirmedRevertedTransfer } from './publicTransfer';
const token = '0x0000000000000000000000000000000000000011',
  recipient = '0x0000000000000000000000000000000000000022';
function fixture() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const state = {
    head: 112n,
    status: 'reverted',
    hash: zeroHash as Hash,
    timestamp: now,
    input: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, 1n],
    }),
    failed: false,
  };
  const client = {
    getChainId: async () => 31611,
    getTransactionReceipt: async () => {
      if (state.failed) throw new Error('unknown receipt');
      return { status: state.status, blockNumber: 100n, blockHash: zeroHash };
    },
    getTransaction: async () => ({ to: token, input: state.input, value: 0n }),
    getBlockNumber: async () => state.head,
    getBlock: async () => ({ hash: state.hash, timestamp: state.timestamp }),
  } as unknown as PublicClient;
  return {
    state,
    client,
    check: () =>
      isConfirmedRevertedTransfer(client, zeroHash, {
        token,
        recipient,
        amount: 1n,
      }),
  };
}
describe('explicit failed-transfer recovery', () => {
  it('requires a canonical failed receipt beyond the buffer and exact payment terms', async () => {
    const f = fixture();
    expect(await f.check()).toBe(true);
    f.state.head = 111n;
    expect(await f.check()).toBe(false);
    f.state.head = 112n;
    f.state.hash = `0x${'11'.repeat(32)}`;
    expect(await f.check()).toBe(false);
    f.state.hash = zeroHash;
    f.state.input = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, 2n],
    });
    expect(await f.check()).toBe(false);
  });
  it('cannot turn an unavailable, stale or successful transfer into permission to pay again', async () => {
    const f = fixture();
    f.state.failed = true;
    expect(await f.check()).toBe(false);
    f.state.failed = false;
    f.state.timestamp -= 121n;
    expect(await f.check()).toBe(false);
    f.state.timestamp += 121n;
    f.state.status = 'success';
    expect(await f.check()).toBe(false);
  });
});
