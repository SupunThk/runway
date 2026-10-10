import { expect, test } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  parseUnits,
} from 'viem';
import { paymentsAbi } from '../packages/mezo/src/index';

// Deterministic read-only RPC responses: no wallet signing or transactions.
for (const state of [
  'completed',
  'cancelled-unpaid',
  'cancelled-settled',
] as const) {
  test(`shows ${state} accounting on a recipient link`, async ({ page }) => {
    const cancelled = state !== 'completed';
    const earned = parseUnits('0.628333333333333333', 18);
    const claimed =
      state === 'completed'
        ? parseUnits('1', 18)
        : state === 'cancelled-settled'
          ? earned
          : parseUnits('0.533333333333333333', 18);
    await page.route('https://rpc.test.mezo.org/**', async (route) => {
      const input = route.request().postDataJSON();
      function response(request: {
        id: number;
        method: string;
        params: any[];
      }) {
        let result: unknown;
        if (request.method === 'eth_chainId') result = '0x7b7b';
        else if (request.method === 'eth_getCode') result = '0x6000';
        else if (request.method === 'eth_getBlockByNumber')
          result = {
            number: '0x100',
            timestamp: '0x1000',
            transactions: [],
            gasLimit: '0x100',
            gasUsed: '0x0',
            difficulty: '0x0',
            extraData: '0x',
            size: '0x1',
            baseFeePerGas: '0x1',
          };
        else if (request.method === 'eth_call') {
          const data = request.params[0].data;
          const abi =
            request.params[0].to.toLowerCase() ===
            '0x118917a40faf1cd7a13db0ef56c86de7973ac503'
              ? erc20Abi
              : paymentsAbi;
          const { functionName } = decodeFunctionData({ abi, data });
          const values: Record<string, unknown> = {
            symbol: 'MUSD',
            decimals: 18,
            musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
            getSchedule: {
              sender: '0x1ac891Ce491851AC87851D62B9184c75A76f55cF',
              recipient: '0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09',
              total: parseUnits('1', 18),
              start: 100n,
              end: 1000n,
              claimed,
              cancelled,
              vestedAtCancellation: cancelled ? earned : 0n,
              referenceHash: `0x${'0'.repeat(64)}`,
            },
            claimable: cancelled ? earned - claimed : 0n,
          };
          result = encodeFunctionResult({
            abi,
            functionName,
            result: values[functionName],
          } as any);
        } else throw new Error(`Unexpected RPC method: ${request.method}`);
        return { jsonrpc: '2.0', id: request.id, result };
      }
      await route.fulfill({
        json: Array.isArray(input) ? input.map(response) : response(input),
      });
    });
    await page.goto('/schedules/1');
    const card = page.locator('.schedule-card');
    await expect(
      card.getByText(cancelled ? 'CANCELLED' : 'COMPLETED', { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole('button', { name: 'Cancel schedule' }),
    ).toHaveCount(0);
    if (cancelled) {
      await expect(
        card.getByText('Refunded to sender', { exact: true }).locator('..'),
      ).toContainText('0.371666666666666667 MUSD');
      await expect(
        card
          .getByText('Total earned by recipient', { exact: true })
          .locator('..'),
      ).toContainText('0.628333333333333333 MUSD');
      await expect(
        card.getByText(
          state === 'cancelled-settled'
            ? /Cancellation settled/
            : /earned, unpaid MUSD remains claimable/,
        ),
      ).toBeVisible();
    } else {
      await expect(card.getByText(/Payment complete/)).toBeVisible();
    }
  });
}
