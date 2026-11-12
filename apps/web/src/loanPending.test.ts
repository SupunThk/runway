import { beforeEach, describe, expect, it, vi } from 'vitest';
import { borrowingWriteDeployment } from '@runway/mezo';
import {
  inspectLoanTransaction,
  loanPendingKey,
  readPendingLoan,
  type PendingLoan,
} from './loanPending';
import type { PublicClient } from 'viem';

const owner = '0x0000000000000000000000000000000000000011';
const hash = `0x${'11'.repeat(32)}` as const;
const blockHash = `0x${'22'.repeat(32)}` as const;
const pending: PendingLoan = {
  version: 1,
  chainId: 31611,
  sender: owner,
  target: borrowingWriteDeployment.operations.address,
  hash,
  data: '0x12345678',
  value: '100',
  operation: 'add-collateral',
  amount: '0',
  debtBefore: '2000',
  collateralBefore: '1000',
  submittedAt: '2026-11-01T00:00:00Z',
};
const records = new Map<string, string>();
beforeEach(() => {
  records.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => records.get(k) ?? null,
  });
});
describe('loan transaction recovery', () => {
  it('accepts an exact deployment/account record and keeps other accounts separate', () => {
    records.set(loanPendingKey(owner), JSON.stringify(pending));
    expect(readPendingLoan(owner)).toEqual(pending);
    expect(
      readPendingLoan('0x0000000000000000000000000000000000000022'),
    ).toBeUndefined();
  });
  it.each([
    { version: 2 },
    { chainId: 1 },
    { value: '-1' },
    { operation: 'approve' },
    { target: owner },
    { hash: 'bad' },
  ])('rejects corrupted or incompatible records %j', (patch) => {
    records.set(
      loanPendingKey(owner),
      JSON.stringify({ ...pending, ...patch }),
    );
    expect(() => readPendingLoan(owner)).toThrow();
  });
  it('rejects damaged JSON rather than treating it as no pending transaction', () => {
    records.set(loanPendingKey(owner), '{');
    expect(() => readPendingLoan(owner)).toThrow('damaged');
  });
  const fixture = (patch: Record<string, unknown> = {}) =>
    ({
      getChainId: async () => 31611,
      getTransactionReceipt: async () => ({
        status: 'success',
        blockNumber: 100n,
        blockHash,
      }),
      getTransaction: async () => ({
        from: owner,
        to: pending.target,
        input: pending.data,
        value: 100n,
        ...patch,
      }),
      getBlock: async () => ({ hash: blockHash }),
      getBlockNumber: async () => 112n,
    }) as unknown as PublicClient;
  it('validates nonzero BTC value, transaction identity and canonical 12-block evidence', async () => {
    expect((await inspectLoanTransaction(fixture(), pending)).state).toBe(
      'confirmed',
    );
    expect(
      (await inspectLoanTransaction(fixture({ value: 0n }), pending)).state,
    ).toBe('mismatch');
    expect(
      (await inspectLoanTransaction(fixture({ input: '0xdead' }), pending))
        .state,
    ).toBe('mismatch');
    expect(
      (await inspectLoanTransaction(fixture({ from: pending.target }), pending))
        .state,
    ).toBe('mismatch');
  });
  it('retains pending evidence during a confirmation delay or reorg', async () => {
    const c = fixture();
    c.getBlockNumber = vi.fn(async () => 111n);
    expect((await inspectLoanTransaction(c, pending)).state).toBe('pending');
    c.getBlockNumber = vi.fn(async () => 112n);
    c.getBlock = vi.fn(async () => ({ hash })) as never;
    expect((await inspectLoanTransaction(c, pending)).state).toBe('pending');
  });
});
