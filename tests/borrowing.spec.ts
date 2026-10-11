import { expect, test } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  toHex,
} from 'viem';
import {
  borrowingAbi,
  borrowingDeployment as deployment,
  paymentsAbi,
  priceFeedAbi,
  priceOracleAbi,
} from '../packages/mezo/src/index';

for (const state of [
  'active',
  'no-position',
  'closed',
  'stale-price',
  'negative-price',
  'rpc-error',
  'changed-implementation',
  'refresh-failed',
  'below-threshold',
  'stale-block',
] as const) {
  test(`borrowing view shows ${state} with verified snapshot evidence`, async ({
    page,
  }) => {
    const account = '0x1ac891Ce491851AC87851D62B9184c75A76f55cF';
    const blockTime = BigInt(
      Math.floor(Date.now() / 1000) - (state === 'stale-block' ? 130 : 0),
    );
    const block = 16094600n;
    const debt = 2010000000000000000000n;
    const collateral = 1000000000000000000n;
    const price = state === 'below-threshold' ? debt : debt * 2n;
    let failedRefresh = false;
    await page.route('https://rpc.test.mezo.org/**', async (route) => {
      const respond = (request: any) => {
        const failure = () => ({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32000, message: 'Borrowing RPC unavailable' },
        });
        let result: unknown;
        if (request.method === 'eth_chainId') result = '0x7b7b';
        else if (request.method === 'eth_blockNumber') result = toHex(block);
        else if (request.method === 'eth_getCode') result = '0x6000';
        else if (request.method === 'eth_getStorageAt') {
          expect(request.params[2]).toBe(toHex(block));
          const implementation =
            request.params[0].toLowerCase() === deployment.manager.toLowerCase()
              ? deployment.managerImplementation
              : deployment.priceImplementation;
          result =
            state === 'changed-implementation'
              ? toHex(0n, { size: 32 })
              : `0x${'0'.repeat(24)}${implementation.slice(2)}`;
        } else if (request.method === 'eth_getBlockByNumber')
          result = {
            number: toHex(block),
            timestamp: toHex(blockTime),
            transactions: [],
            gasLimit: '0x100',
            gasUsed: '0x0',
            difficulty: '0x0',
            extraData: '0x',
            size: '0x1',
            baseFeePerGas: '0x1',
          };
        else if (request.method === 'eth_call') {
          const target = request.params[0].to.toLowerCase();
          const abi =
            target === deployment.manager.toLowerCase()
              ? borrowingAbi
              : target === deployment.priceFeed.toLowerCase()
                ? priceFeedAbi
                : target === deployment.oracle.toLowerCase()
                  ? priceOracleAbi
                  : target === deployment.musd.toLowerCase()
                    ? erc20Abi
                    : paymentsAbi;
          const { functionName } = decodeFunctionData({
            abi,
            data: request.params[0].data,
          });
          if (
            [deployment.manager, deployment.priceFeed, deployment.oracle].some(
              (address) => address.toLowerCase() === target,
            )
          ) {
            expect(request.params[1]).toBe(toHex(block));
            if (state === 'rpc-error' || failedRefresh) return failure();
          }
          const values: Record<string, unknown> = {
            musd: deployment.musd,
            musdToken: deployment.musd,
            symbol: 'MUSD',
            decimals: 18,
            priceFeed: deployment.priceFeed,
            oracle: deployment.oracle,
            getTroveStatus:
              state === 'no-position' ? 0 : state === 'closed' ? 3 : 1,
            getEntireDebtAndColl: [
              collateral,
              debt - 10000000000000000000n,
              10000000000000000000n,
              100n,
              200n,
              300n,
            ],
            getTroveInterestRate: 100,
            MCR: 1100000000000000000n,
            MUSD_GAS_COMPENSATION: 200000000000000000000n,
            latestRoundData: [
              1n,
              state === 'negative-price' ? -1n : price,
              blockTime,
              blockTime - (state === 'stale-price' ? 61n : 0n),
              0n,
            ],
            fetchPrice: price,
            getCurrentICR: (collateral * price) / debt,
          };
          result = encodeFunctionResult({
            abi,
            functionName,
            result: values[functionName],
          } as any);
        } else throw new Error(`Unexpected borrowing RPC ${request.method}`);
        return { jsonrpc: '2.0', id: request.id, result };
      };
      const input = route.request().postDataJSON();
      await route.fulfill({
        json: Array.isArray(input) ? input.map(respond) : respond(input),
      });
    });
    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Mezo borrowing position' });
    await expect(
      panel.getByText('Connect your wallet or enter an address', {
        exact: false,
      }),
    ).toBeVisible();
    await panel.getByLabel('Borrowing account').fill(account);
    await panel.getByRole('button', { name: 'Check borrowing' }).click();
    if (state === 'rpc-error' || state === 'changed-implementation') {
      await expect(panel.getByRole('alert')).toContainText(
        'Borrowing read unavailable',
      );
      await expect(
        panel.getByText('Total protocol debt', { exact: true }),
      ).toHaveCount(0);
    } else if (state === 'no-position' || state === 'closed') {
      await expect(
        panel.getByText(
          state === 'no-position'
            ? /No Mezo borrowing position found/
            : /Position closed by liquidation/,
        ),
      ).toBeVisible();
      await expect(
        panel.getByText('Collateral ratio', { exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(
        panel.getByText('Total protocol debt', { exact: true }).locator('..'),
      ).toContainText('2010 MUSD');
      await expect(
        panel
          .getByText('Accrued interest included', { exact: true })
          .locator('..'),
      ).toContainText('10 MUSD');
      await expect(
        panel
          .getByText('Fixed annual interest rate', { exact: true })
          .locator('..'),
      ).toContainText('1%');
      await expect(
        panel.getByText('Liquidation threshold', { exact: true }).locator('..'),
      ).toContainText('110%');
      if (['stale-price', 'negative-price', 'stale-block'].includes(state)) {
        await expect(panel.getByRole('alert')).toContainText(
          'Loan health unknown',
        );
        await expect(
          panel.getByText('Collateral ratio', { exact: true }),
        ).toHaveCount(0);
      } else {
        await expect(
          panel.getByText('Collateral ratio', { exact: true }).locator('..'),
        ).toContainText(state === 'below-threshold' ? '100%' : '200%');
        await expect(
          panel.getByText(
            state === 'below-threshold'
              ? /Below the protocol liquidation threshold/
              : /Above the protocol liquidation threshold/,
          ),
        ).toBeVisible();
      }
      if (state === 'refresh-failed') {
        failedRefresh = true;
        await panel.getByRole('button', { name: 'Refresh borrowing' }).click();
        await expect(
          panel.getByText(/Previous snapshot below; loan health is unknown/),
        ).toBeVisible();
        await expect(
          panel.getByText('Collateral ratio', { exact: true }),
        ).toHaveCount(0);
        await expect(
          panel.getByText('Total protocol debt', { exact: true }).locator('..'),
        ).toContainText('2010 MUSD');
      }
    }
    await expect(
      panel.getByRole('link', { name: 'Manage borrowing in Mezo' }),
    ).toHaveAttribute('href', 'https://testnet.mezo.org');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
