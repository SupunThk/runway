import { describe, expect, it } from 'vitest';
import { contractSignatureVerifier } from './contract-auth.ts';
const address = '0x0000000000000000000000000000000000000001' as const;
const blockHash = `0x${'1'.repeat(64)}`;
function rpc(overrides: Record<string, unknown> = {}) {
  return {
    getChainId: async () => 31611,
    getBlock: async () => ({
      number: 100n,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      hash: blockHash,
    }),
    getCode: async () => '0x6000',
    readContract: async () => '0x1626ba7e',
    ...overrides,
  } as unknown as NonNullable<Parameters<typeof contractSignatureVerifier>[0]>;
}
const proof = {
  address,
  message: 'Domain-bound test login message',
  signature: '0xabcd' as const,
};
describe('ERC-1271 contract login verification', () => {
  it('accepts only the magic return value from a deployed contract on the expected chain', async () => {
    expect(await contractSignatureVerifier(rpc())(proof)).toBe(true);
    expect(
      await contractSignatureVerifier(
        rpc({ readContract: async () => '0xffffffff' }),
      )(proof),
    ).toBe(false);
    expect(
      await contractSignatureVerifier(rpc({ getCode: async () => '0x' }))(
        proof,
      ),
    ).toBe(false);
  });
  it('fails closed for a wrong chain, stale tip or changed canonical block', async () => {
    await expect(
      contractSignatureVerifier(rpc({ getChainId: async () => 1 }))(proof),
    ).rejects.toThrow();
    await expect(
      contractSignatureVerifier(
        rpc({
          getBlock: async () => ({
            number: 100n,
            timestamp: 0n,
            hash: blockHash,
          }),
        }),
      )(proof),
    ).rejects.toThrow();
    let calls = 0;
    await expect(
      contractSignatureVerifier(
        rpc({
          getBlock: async () => ({
            number: 100n,
            timestamp: BigInt(Math.floor(Date.now() / 1000)),
            hash: ++calls === 1 ? blockHash : `0x${'2'.repeat(64)}`,
          }),
        }),
      )(proof),
    ).rejects.toThrow('changed');
  });
  it('preserves RPC failures instead of accepting an unverifiable signature', async () => {
    await expect(
      contractSignatureVerifier(
        rpc({
          readContract: async () => {
            throw new Error('RPC failed');
          },
        }),
      )(proof),
    ).rejects.toThrow('RPC failed');
  });
});
