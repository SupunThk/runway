import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import {
  borrowingDeployment as deployment,
  readBorrowingPosition,
  scaleOraclePrice,
} from '../src/borrowing';

const account = '0x1ac891Ce491851AC87851D62B9184c75A76f55cF';
function fixture(
  overrides: Record<string, unknown> = {},
  implementationChanged = false,
) {
  const collateral = 35000000000000000n;
  const principal = 2001800000000000000000n;
  const interest = 35000000000000000n;
  const price = 82837580000000000000000n;
  const values: Record<string, unknown> = {
    musdToken: deployment.musd,
    priceFeed: deployment.priceFeed,
    getTroveStatus: 1,
    getEntireDebtAndColl: [collateral, principal, interest, 100n, 200n, 300n],
    getTroveInterestRate: 100,
    MCR: 1100000000000000000n,
    MUSD_GAS_COMPENSATION: 200000000000000000000n,
    oracle: deployment.oracle,
    latestRoundData: [20n, price, 995n, 995n, 0n],
    decimals: 18,
    fetchPrice: price,
    getCurrentICR: (collateral * price) / (principal + interest),
    ...overrides,
  };
  const pinned: bigint[] = [];
  const readContract = vi.fn(async ({ functionName, blockNumber }: any) => {
    pinned.push(blockNumber);
    const value = values[functionName];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error(`Unexpected read ${functionName}`);
    return value;
  });
  const client = {
    getChainId: async () => 31611,
    getBlock: async () => ({ number: 100n, timestamp: 1000n }),
    getCode: async () => '0x6000',
    getStorageAt: async ({ address }: any) =>
      `0x${'0'.repeat(24)}${implementationChanged ? '0'.repeat(40) : (address === deployment.manager ? deployment.managerImplementation : deployment.priceImplementation).slice(2)}`,
    readContract,
  } as unknown as PublicClient;
  return { client, values, pinned, readContract };
}
describe('verified borrowing reads', () => {
  it('includes accrued interest once and does not double-count redistribution', async () => {
    const { client, pinned } = fixture();
    const result = await readBorrowingPosition(
      client,
      account,
      deployment.musd,
    );
    expect(result.active).toBe(true);
    if (!result.active) throw new Error('Expected active position');
    expect(result.debt).toBe(2001835000000000000000n);
    expect(result.collateral).toBe(35000000000000000n);
    expect(result.price?.ratio).toBe(
      (result.collateral * result.price!.value) / result.debt,
    );
    expect(new Set(pinned)).toEqual(new Set([100n]));
  });
  it.each([0, 2, 3, 4])(
    'reports inactive status %i without requesting prices',
    async (status) => {
      const { client, readContract } = fixture({ getTroveStatus: status });
      expect(
        (await readBorrowingPosition(client, account, deployment.musd)).active,
      ).toBe(false);
      expect(
        readContract.mock.calls.some(
          ([args]) => args.functionName === 'latestRoundData',
        ),
      ).toBe(false);
    },
  );
  it.each([
    { latestRoundData: [1n, 1n, 900n, 900n, 0n] },
    { latestRoundData: [1n, 1n, 1001n, 1001n, 0n] },
    { latestRoundData: [1n, -1n, 1000n, 1000n, 0n] },
    { fetchPrice: new Error('Oracle unavailable') },
    { getCurrentICR: 1n },
  ])(
    'keeps debt but withholds health when price evidence fails',
    async (overrides) => {
      const { client } = fixture(overrides);
      const result = await readBorrowingPosition(
        client,
        account,
        deployment.musd,
      );
      expect(result.active).toBe(true);
      if (!result.active) throw new Error('Expected active position');
      expect(result.debt).toBeGreaterThan(0n);
      expect(result.price).toBeUndefined();
      expect(result.priceError).toBeTruthy();
    },
  );
  it('rejects an unverified proxy upgrade', async () => {
    const { client } = fixture({}, true);
    await expect(
      readBorrowingPosition(client, account, deployment.musd),
    ).rejects.toThrow('reverification');
  });
  it('rejects wrong network and token configurations', async () => {
    const { client } = fixture();
    await expect(
      readBorrowingPosition(client, account, account),
    ).rejects.toThrow('configured MUSD');
    client.getChainId = async () => 1;
    await expect(
      readBorrowingPosition(client, account, deployment.musd),
    ).rejects.toThrow('wrong network');
  });
  it('normalizes oracle decimals without floating point', () => {
    expect(scaleOraclePrice(8283758000000n, 8)).toBe(82837580000000000000000n);
    expect(scaleOraclePrice(8283758000000000000000000n, 20)).toBe(
      82837580000000000000000n,
    );
    expect(() => scaleOraclePrice(-1n, 18)).toThrow();
    expect(() => scaleOraclePrice(1n, 37)).toThrow();
  });
});
