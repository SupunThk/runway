import { describe, expect, it } from 'vitest';
import {
  encodeFunctionData,
  encodeEventTopics,
  encodeAbiParameters,
  erc20Abi,
  zeroHash,
  type Log,
  type Hash,
} from 'viem';
import { directPaymentVerifier, type DirectSource } from './direct-payments.ts';
import { paymentDeployment } from './reconciliation.ts';

const owner = '0x0000000000000000000000000000000000000011';
const recipient = '0x0000000000000000000000000000000000000022';
const now = new Date('2026-10-23T12:00:00Z');
const timestamp = BigInt(now.getTime() / 1000);
const invoice = {
  recipient,
  amountBaseUnits: '1000000000000000001',
  createdAt: new Date(now.getTime() - 100000).toISOString(),
};
function fixture() {
  const tx = {
    from: owner,
    to: paymentDeployment.token as string,
    input: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, 1000000000000000001n],
    }),
    value: 0n,
  };
  const receipt = {
    status: 'success',
    blockNumber: 100n,
    blockHash: zeroHash,
    logs: [
      {
        address: paymentDeployment.token,
        topics: encodeEventTopics({
          abi: erc20Abi,
          eventName: 'Transfer',
          args: { from: owner, to: recipient },
        }),
        data: encodeAbiParameters(
          [{ type: 'uint256' }],
          [1000000000000000001n],
        ),
      } as Log,
    ],
  };
  const state = {
    head: 112n,
    hash: zeroHash as Hash,
    timestamp,
    chainId: 31611,
  };
  const source: DirectSource = {
    getChainId: async () => state.chainId,
    getTransaction: async () => tx,
    getTransactionReceipt: async () => receipt,
    getBlockNumber: async () => state.head,
    getBlock: async () => ({ hash: state.hash, timestamp: state.timestamp }),
  };
  return {
    tx,
    receipt,
    state,
    verify: () => directPaymentVerifier(source)(zeroHash, invoice, owner, now),
  };
}
describe('one-time invoice payment evidence', () => {
  it('requires twelve confirmations and an exact Transfer event', async () => {
    const f = fixture();
    expect(await f.verify()).toBe('paid');
    f.state.head = 111n;
    expect(await f.verify()).toBe('awaiting_confirmation');
    f.state.head = 112n;
    f.receipt.logs = [];
    expect(await f.verify()).toBe('invalid');
  });
  it('rejects wrong senders, tokens, recipients, amounts, and reverted transactions', async () => {
    const f = fixture();
    f.tx.from = recipient;
    expect(await f.verify()).toBe('invalid');
    f.tx.from = owner;
    f.tx.to = owner;
    expect(await f.verify()).toBe('invalid');
    f.tx.to = paymentDeployment.token;
    f.tx.input = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [owner, 1000000000000000001n],
    });
    expect(await f.verify()).toBe('invalid');
    f.tx.input = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, 1000000000000000000n],
    });
    expect(await f.verify()).toBe('invalid');
    const reverted = fixture();
    reverted.receipt.status = 'reverted';
    expect(await reverted.verify()).toBe('invalid');
  });
  it('does not trust reorged blocks, stale RPC heads, or the wrong chain', async () => {
    const f = fixture();
    f.state.hash = `0x${'1'.repeat(64)}`;
    expect(await f.verify()).toBe('awaiting_confirmation');
    f.state.hash = zeroHash;
    f.state.timestamp -= 301n;
    expect(await f.verify()).toBe('unavailable');
    f.state.timestamp = timestamp;
    f.state.chainId = 1;
    expect(await f.verify()).toBe('unavailable');
  });
  it('rejects transfers made before the invoice existed', async () => {
    const f = fixture();
    f.state.timestamp -= 101n;
    expect(await f.verify()).toBe('invalid');
  });
});
