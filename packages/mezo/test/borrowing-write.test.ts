import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { zeroAddress, type PublicClient } from 'viem';
import { borrowingDeployment as base } from '../src/borrowing';
import { borrowingWriteDeployment as deps } from '../src/borrowing-write-config';
import { prepareLoanAction, readLoanSnapshot } from '../src/borrowing-write';
import type { LoanInput } from '../src/borrowing-quotes';

const fixture = JSON.parse(
  readFileSync('tests/fixtures/mezo-borrowing-runtime.json', 'utf8'),
);
const runtimes: Record<string, `0x${string}`> = JSON.parse(
  gunzipSync(Buffer.from(fixture.runtime, 'base64')).toString(),
);
const U = 10n ** 18n;
const owner = '0x0000000000000000000000000000000000000011';
function source(overrides: Record<string, unknown> = {}) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const pins: bigint[] = [];
  const values: Record<string, unknown> = {
    musd: base.musd,
    musdToken: base.musd,
    troveManager: base.manager,
    priceFeed: base.priceFeed,
    sortedTroves: deps.sorted.address,
    interestRateManager: deps.interest.address,
    governableVariables: deps.governance.address,
    borrowerOperations: deps.operations.address,
    borrowerOperationsAddress: deps.operations.address,
    oracle: base.oracle,
    fetchPrice: 10_000n * U,
    latestRoundData: [1n, 10_000n * U, now, now, 0n],
    decimals: 18,
    getTroveStatus: 1,
    getEntireDebtAndColl: [U, 2_100n * U, 0n, 0n, 0n, 0n],
    getTroveMaxBorrowingCapacity: 6_000n * U,
    getTroveInterestRate: 100,
    interestRate: 100,
    getAccruedInterest: 10n * U,
    getEntireSystemDebt: 100_000n * U,
    getEntireSystemColl: 100n * U,
    MCR: (11n * U) / 10n,
    CCR: (15n * U) / 10n,
    minNetDebt: 1800n * U,
    MUSD_GAS_COMPENSATION: 200n * U,
    borrowingRate: U / 1000n,
    isAccountFeeExempt: false,
    balanceOf: 1_000n * U,
    getTCR: 10n * U,
    checkRecoveryMode: false,
    getApproxHint: [zeroAddress, 0n, 1n],
    findInsertPosition: [zeroAddress, zeroAddress],
    ...overrides,
  };
  const client = {
    getChainId: vi.fn(async () => 31611),
    getBlock: vi.fn(async () => ({
      number: 123n,
      timestamp: now,
      hash: `0x${'11'.repeat(32)}`,
    })),
    getCode: vi.fn(async ({ address, blockNumber }: any) => {
      pins.push(blockNumber);
      return runtimes[address.toLowerCase()] ?? '0x6000';
    }),
    getStorageAt: vi.fn(async ({ address, blockNumber }: any) => {
      pins.push(blockNumber);
      const dep = Object.values(deps).find(
        (d) => d.address.toLowerCase() === address.toLowerCase(),
      );
      const implementation =
        dep?.implementation ??
        (address.toLowerCase() === base.manager.toLowerCase()
          ? base.managerImplementation
          : base.priceImplementation);
      return `0x${'0'.repeat(24)}${implementation.slice(2)}`;
    }),
    readContract: vi.fn(async ({ functionName, blockNumber }: any) => {
      pins.push(blockNumber);
      if (!(functionName in values))
        throw new Error(`Unexpected read ${functionName}`);
      return values[functionName];
    }),
    getBalance: vi.fn(async ({ blockNumber }: any) => {
      pins.push(blockNumber);
      return 2n * U;
    }),
    call: vi.fn(async () => ({ data: '0x' })),
    estimateGas: vi.fn(async () => 200_000n),
    getGasPrice: vi.fn(async () => 10n),
  };
  return { client: client as unknown as PublicClient, stub: client, pins, now };
}
const input: LoanInput = {
  operation: 'borrow',
  amount: 100n * U,
  collateralAdded: 0n,
  targetRatio: 2n * U,
};
describe('verified borrowing write preparation', () => {
  it('pins reads, validates real runtime hashes, and includes system interest exactly once', async () => {
    const { client, pins } = source();
    const s = await readLoanSnapshot(client, owner, base.musd);
    expect(s.systemDebt).toBe(100_010n * U);
    expect(s.debt).toBe(2100n * U);
    expect(new Set(pins)).toEqual(new Set([123n]));
  });
  it('reads a new borrower with an oracle and system constraints rather than inventing a loan', async () => {
    const { client } = source({
      getTroveStatus: 0,
      getEntireDebtAndColl: [0n, 0n, 0n, 0n, 0n, 0n],
    });
    const s = await readLoanSnapshot(client, owner, base.musd);
    expect(s.active).toBe(false);
    expect(s.debt).toBe(0n);
    expect(s.price).toBe(10_000n * U);
  });
  it('rejects changed bytecode and unsupported bindings before any action', async () => {
    const { client, stub } = source();
    stub.getCode.mockResolvedValue('0x6000');
    await expect(readLoanSnapshot(client, owner, base.musd)).rejects.toThrow(
      'identity',
    );
    await expect(
      readLoanSnapshot(source({ musd: zeroAddress }).client, owner, base.musd),
    ).rejects.toThrow('bindings');
  });
  it('rejects a stale oracle and inconsistent system ratio', async () => {
    const { now } = source();
    await expect(
      readLoanSnapshot(
        source({ latestRoundData: [1n, 10_000n * U, now - 61n, now - 61n, 0n] })
          .client,
        owner,
        base.musd,
      ),
    ).rejects.toThrow('stale');
    await expect(
      readLoanSnapshot(source({ getTCR: 1n }).client, owner, base.musd),
    ).rejects.toThrow('reconcile');
  });
  it('prepares a direct founder call with fresh hints and no signing/broadcasting', async () => {
    const { client, stub } = source();
    const s = await readLoanSnapshot(client, owner, base.musd);
    const p = await prepareLoanAction(client, s, input);
    expect(p.transaction.account).toBe(owner);
    expect(p.transaction.to).toBe(deps.operations.address);
    expect(p.transaction.value).toBe(0n);
    expect(stub.call).toHaveBeenCalledOnce();
    expect(
      stub.readContract.mock.calls.some(
        ([a]) =>
          a.functionName === 'findInsertPosition' && a.blockNumber === 123n,
      ),
    ).toBe(true);
    expect(p.quote.proceeds).toBe(input.amount);
  });
  it('blocks invalid capacity and stale quotes before simulation', async () => {
    const { client, stub } = source();
    const s = await readLoanSnapshot(client, owner, base.musd);
    await expect(
      prepareLoanAction(client, s, { ...input, amount: 10_000n * U }),
    ).rejects.toThrow('capacity');
    await expect(
      prepareLoanAction(client, { ...s, chainTime: s.chainTime - 61n }, input),
    ).rejects.toThrow('stale');
    expect(stub.call).not.toHaveBeenCalled();
  });
  it('requires wallet MUSD for repayment and BTC for the rest of the flow', async () => {
    const { client } = source();
    const s = await readLoanSnapshot(client, owner, base.musd);
    await expect(
      prepareLoanAction(
        client,
        { ...s, walletMusd: 0n },
        { ...input, operation: 'repay' },
      ),
    ).rejects.toThrow('Insufficient wallet');
    await expect(
      prepareLoanAction(client, { ...s, walletBtc: 0n }, input),
    ).rejects.toThrow('Insufficient BTC');
  });
  it('rejects a source-block reorg during snapshot assembly', async () => {
    const { client, stub, now } = source();
    stub.getBlock.mockResolvedValueOnce({
      number: 123n,
      timestamp: now,
      hash: `0x${'11'.repeat(32)}`,
    });
    stub.getBlock.mockResolvedValue({
      number: 123n,
      timestamp: now,
      hash: `0x${'22'.repeat(32)}`,
    });
    await expect(readLoanSnapshot(client, owner, base.musd)).rejects.toThrow(
      'Source block changed',
    );
  });
});
