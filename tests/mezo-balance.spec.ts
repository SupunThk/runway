import { expect, test } from '@playwright/test';
import { MEZO_TESTNET_TOKEN } from '../packages/mezo/src/index';
import { installPlannerFixture, connectPlannerWallet } from './planner-fixture';

for (const scenario of [
  'valid',
  'wrong-symbol',
  'read-failure',
  'native-empty-code',
] as const) {
  test(`MEZO ledger ${scenario} preserves payment readiness`, async ({
    page,
  }) => {
    const { reads, block } = await installPlannerFixture(page, {
      symbol: scenario === 'wrong-symbol' ? 'OTHER' : undefined,
      mezoFailure: scenario === 'read-failure',
      emptyCode: scenario === 'native-empty-code',
    });
    await page.goto('/');
    await connectPlannerWallet(page);
    const ledger = page.getByRole('region', { name: 'Treasury balances' });
    if (scenario === 'valid' || scenario === 'native-empty-code') {
      await expect(ledger).toContainText('42 MEZO · Mezo network token');
      const read = reads.find(
        (r) =>
          r.target === MEZO_TESTNET_TOKEN.toLowerCase() &&
          r.functionName === 'balanceOf',
      );
      expect(read?.block).toBe(`0x${block.toString(16)}`);
    } else await expect(ledger).toContainText('MEZO balance unavailable');
    await expect(ledger).toContainText('100');
    await page
      .getByRole('button', { name: 'New payment', exact: false })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Approve & fund schedule' }),
    ).toBeEnabled();
  });
}
