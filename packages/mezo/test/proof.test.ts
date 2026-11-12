import { describe, expect, it } from 'vitest';
import { keccak256, zeroHash, type Address, type PublicClient } from 'viem';
import {
  aggregateFundingProof,
  readFundingProofPage,
  type ProofAnchor,
} from '../src/proof';
const sender = '0x0000000000000000000000000000000000000011',
  recipient = '0x0000000000000000000000000000000000000022',
  contract = '0x0000000000000000000000000000000000000033',
  token = '0x0000000000000000000000000000000000000044';
function fixture() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const reads: {
    functionName: string;
    blockNumber: bigint;
    args?: readonly unknown[];
  }[] = [];
  const state = {
    fail: false,
    reorg: false,
    duplicate: false,
    sender: sender as Address,
    wrongCode: false,
  };
  const client = {
    getChainId: async () => 31611,
    getBlock: async ({ blockNumber }: { blockNumber?: bigint } = {}) => ({
      number: blockNumber ?? 112n,
      hash: state.reorg ? `0x${'11'.repeat(32)}` : zeroHash,
      timestamp: now,
    }),
    getCode: async () => (state.wrongCode ? '0x6001' : '0x6000'),
    readContract: async (args: {
      functionName: string;
      blockNumber: bigint;
      args?: readonly unknown[];
    }) => {
      reads.push(args);
      if (args.functionName === 'musd') return token;
      if (args.functionName === 'symbol') return 'MUSD';
      if (args.functionName === 'decimals') return 18;
      if (args.functionName === 'balanceOf') return 150n;
      if (args.functionName === 'outstandingObligations') return 100n;
      if (args.functionName === 'getSenderScheduleIds')
        return state.duplicate ? [1n, 1n] : [1n, 2n];
      if (args.functionName === 'getSchedule') {
        if (state.fail && args.args?.[0] === 2n)
          throw new Error('row unavailable');
        return {
          sender: state.sender,
          recipient,
          total: 100n,
          claimed: 25n,
          cancelled: args.args?.[0] === 2n,
          vestedAtCancellation: 40n,
          start: now - 100n,
          end: now + 100n,
        };
      }
      throw new Error('Unexpected read ' + args.functionName);
    },
  } as unknown as PublicClient;
  return {
    client,
    state,
    reads,
    config: { contract, token, codeHash: keccak256('0x6000') } as const,
  };
}
describe('wallet-free pinned funding proof', () => {
  it('uses sender-only discovery and preserves earned entitlement after cancellation', async () => {
    const f = fixture(),
      page = await readFundingProofPage(f.client, f.config, sender);
    expect(page.failed).toBe(0);
    expect(aggregateFundingProof(page.rows)).toEqual({
      committed: 90n,
      funded: 200n,
      claimed: 50n,
      refunded: 60n,
      active: 1,
      recipients: 1,
    });
    expect(f.reads.every((r) => r.blockNumber === 100n)).toBe(true);
    expect(
      f.reads.some((r) => r.functionName === 'getRecipientScheduleIds'),
    ).toBe(false);
    expect(page.anchor.balance >= page.anchor.obligations).toBe(true);
  });
  it('reports per-row failures and refuses identity changes and duplicate discovery', async () => {
    const f = fixture();
    f.state.fail = true;
    const partial = await readFundingProofPage(f.client, f.config, sender);
    expect(partial.failed).toBe(1);
    expect(partial.rows).toHaveLength(1);
    f.state.wrongCode = true;
    await expect(
      readFundingProofPage(f.client, f.config, sender),
    ).rejects.toThrow('identity');
    f.state.wrongCode = false;
    f.state.duplicate = true;
    await expect(
      readFundingProofPage(f.client, f.config, sender),
    ).rejects.toThrow('discovery');
  });
  it('invalidates reorged pagination and prevents duplicate-page totals', async () => {
    const f = fixture(),
      first = await readFundingProofPage(f.client, f.config, sender);
    f.state.reorg = true;
    await expect(
      readFundingProofPage(
        f.client,
        f.config,
        sender,
        100,
        first.anchor as ProofAnchor,
      ),
    ).rejects.toThrow('snapshot');
    expect(() => aggregateFundingProof([...first.rows, ...first.rows])).toThrow(
      'Duplicate',
    );
  });
});
