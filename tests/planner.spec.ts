import { expect, test } from '@playwright/test';
import { connectPlannerWallet, installPlannerFixture } from './planner-fixture';

test('planner combines current schedules and wallet funds, then stresses borrowing capacity', async ({
  page,
}) => {
  const { reads } = await installPlannerFixture(page);
  await page.goto('/');
  await connectPlannerWallet(page);
  const summary = page.locator('.info-card.light');
  await expect(summary).toContainText('Payroll covered until');
  expect(reads.some((r) => r.functionName === 'getTroveStatus')).toBe(false);
  await page.getByRole('link', { name: 'Plan with your BTC loan' }).click();
  const panel = page.getByRole('region', { name: 'Runway planner' });
  await expect(panel).toContainText('2.00 MUSD / day');
  await expect(panel).toContainText('Covered in this scenario');
  await panel.getByLabel('Planner BTC price drop').fill('50');
  await expect(panel).toContainText('Not covered in this scenario');
  await expect(panel).toContainText('MUSD short');
  await expect(
    panel.getByRole('link', { name: 'Borrow more MUSD in Mezo' }),
  ).toHaveAttribute('target', '_blank');
  await expect(
    panel.getByRole('link', { name: 'Borrow more MUSD in Mezo' }),
  ).toHaveAttribute('href', /https:\/\/testnet\.mezo\.org(?:\/borrow)?$/);
  await panel.getByLabel('Months', { exact: true }).fill('');
  await expect(panel).toContainText('Choose 1–24 whole planning months.');
  await expect(
    panel.getByText('Not covered in this scenario', { exact: false }),
  ).toHaveCount(0);
  await panel.getByLabel('Months', { exact: true }).fill('3');
  await expect(panel).toContainText('Not covered in this scenario');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.tools/planner-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= 320),
  ).toBe(true);
  await page.screenshot({ path: '.tools/planner-mobile.png', fullPage: true });
});

for (const state of [
  'stale-loan',
  'empty',
  'partial',
  'future',
  'payment-error',
  'stale-payments',
  'invalid-deployment',
  'invalid-target',
  'inactive-loan',
] as const) {
  test(`planner gates ${state} without inventing coverage`, async ({
    page,
  }) => {
    await installPlannerFixture(page, {
      staleLoan: state === 'stale-loan',
      empty: state === 'empty',
      partial: state === 'partial',
      future: state === 'future',
      paymentFailure: state === 'payment-error',
      stalePayments: state === 'stale-payments',
      invalidDeployment: state === 'invalid-deployment',
      minimumRatio: state === 'invalid-target' ? 24n * 10n ** 17n : undefined,
      inactiveLoan: state === 'inactive-loan',
    });
    await page.goto('/borrowing');
    await connectPlannerWallet(page);
    const panel = page.getByRole('region', { name: 'Runway planner' });
    if (state === 'stale-loan') {
      await expect(panel).toContainText('Loan health unknown');
      await expect(panel).toContainText('Payroll covered until');
      await expect(
        panel.getByText('Additional borrowing capacity at this scenario'),
      ).toHaveCount(0);
    } else if (state === 'empty' || state === 'future') {
      await expect(panel).toContainText(
        'No active payment schedules. Fund one to see your runway.',
      );
      await expect(panel).toContainText(
        'Additional borrowing capacity at this scenario',
      );
      await expect(panel).not.toContainText('Covered in this scenario');
      if (state === 'future')
        await expect(panel).toContainText(
          '2 future-starting schedules excluded.',
        );
    } else if (state === 'partial') {
      await expect(panel).toContainText(
        'Load all schedules on Overview to plan accurately.',
      );
      await expect(
        panel.getByRole('link', { name: 'Open Overview' }),
      ).toHaveAttribute('href', '/');
      await expect(panel.locator('.planner-headline')).toHaveCount(0);
    } else if (state === 'invalid-target') {
      await expect(panel).toContainText('No target collateral ratio preset');
      await expect(panel).not.toContainText('Covered in this scenario');
    } else if (state === 'inactive-loan') {
      await expect(panel).toContainText('No Mezo borrowing position found');
      await expect(panel.locator('.planner-headline')).toBeVisible();
    } else {
      await expect(panel).toContainText(
        state === 'invalid-deployment'
          ? 'Payment deployment does not match'
          : 'Payment data unavailable',
      );
      await expect(panel.locator('.planner-headline')).toHaveCount(0);
      await expect(panel).not.toContainText('No active payment schedules');
    }
  });
}

test('unequal escrow ends spend wallet funds per stream', async ({ page }) => {
  const { now } = await installPlannerFixture(page, { unequal: true });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Runway planner' });
  await expect(panel.locator('.planner-headline time')).toHaveAttribute(
    'datetime',
    new Date(Number(now + 150n) * 1000).toISOString(),
  );
});

test('planner displays loading until payment snapshot resolves', async ({
  page,
}) => {
  await installPlannerFixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://rpc.test.mezo.org/**', async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Runway planner' });
  await expect(panel).toContainText('Checking testnet connection');
  await expect(panel.locator('.planner-headline')).toHaveCount(0);
  await expect(panel).not.toContainText('No active payment schedules');
  release();
  await expect(panel.locator('.planner-headline')).toBeVisible();
});
