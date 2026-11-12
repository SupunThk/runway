import { expect, test } from '@playwright/test';
import { connectPlannerWallet } from './planner-fixture';
import { installLoanFixture } from './loan-fixture';

test('reviews fee-aware borrowing, submits only on confirmation, and resumes after reload without signing twice', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page, { pending: true });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await expect(panel.getByText('Normal Mode', { exact: true })).toBeVisible();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  const review = panel.getByLabel('Review loan action');
  await expect(review).toContainText('2200.1 MUSD');
  await expect(review).toContainText('0.1 MUSD');
  expect(fixture.submissions()).toBe(0);
  await review
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(panel.getByLabel('Saved loan transaction')).toContainText(
    'Waiting for receipt',
  );
  expect(fixture.submissions()).toBe(1);
  await page.reload();
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await expect(panel.getByLabel('Saved loan transaction')).toBeVisible();
  fixture.finish();
  await panel.getByRole('button', { name: 'Check loan transaction' }).click();
  await expect(panel.getByLabel('Saved loan transaction')).toContainText(
    'Loan transaction confirmed',
  );
  expect(fixture.submissions()).toBe(1);
  await panel.getByRole('link', { name: 'Prepare a payment schedule' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fund a payment schedule' }),
  ).toBeVisible();
  await expect(page.getByLabel('Total funding')).toHaveValue('100');
});
test('opens a new trove with explicit minimum debt, fee and reserve', async ({
  page,
}) => {
  await installLoanFixture(page, { inactive: true });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await expect(panel.getByLabel('Loan action')).toHaveValue('open');
  await panel.getByLabel('Receive in wallet').fill('10');
  await panel.getByLabel('BTC collateral to add').fill('1');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByRole('alert')).toContainText('minimum');
  await panel.getByLabel('Receive in wallet').fill('1800');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toContainText(
    '2001.8 MUSD',
  );
  await expect(panel.getByLabel('Review loan action')).toContainText(
    '200 MUSD',
  );
});
test('collateral top-up creates no MUSD debt; repayment retains the minimum', async ({
  page,
}) => {
  await installLoanFixture(page);
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await panel.getByLabel('Loan action').selectOption('add-collateral');
  await panel.getByLabel('BTC collateral to add').fill('0.1');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toContainText('1.1 BTC');
  await panel.getByRole('button', { name: 'Change loan terms' }).click();
  await panel.getByLabel('Loan action').selectOption('repay');
  await panel.getByLabel('Repay amount').fill('101');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByRole('alert')).toContainText('minimum');
  await panel.getByLabel('Repay amount').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toContainText(
    '2000 MUSD',
  );
});
test('Recovery Mode prevents debt-only increases and accepts sufficient collateral', async ({
  page,
}) => {
  await installLoanFixture(page, { recovery: true });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await expect(panel.getByText('Recovery Mode', { exact: true })).toBeVisible();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByRole('alert')).toContainText('must not reduce');
  await panel.getByLabel('BTC collateral to add').fill('0.1');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toContainText(
    '2200 MUSD',
  );
});
test('changed fees invalidate the review without opening a transaction prompt', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page);
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toBeVisible();
  fixture.setFee(2n * 10n ** 15n);
  await panel
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(panel.getByRole('alert')).toContainText('terms changed');
  expect(fixture.submissions()).toBe(0);
});
for (const failure of ['changedCode', 'stale', 'lowGas'] as const) {
  test(`loan actions reject ${failure} without signing`, async ({ page }) => {
    const fixture = await installLoanFixture(page, { [failure]: true });
    await page.goto('/borrowing');
    await connectPlannerWallet(page);
    const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
    await panel.getByRole('button', { name: 'Open loan controls' }).click();
    if (failure === 'lowGas') {
      await panel.getByLabel('Receive in wallet').fill('100');
      await panel.getByRole('button', { name: 'Review and simulate' }).click();
      await expect(panel.getByRole('alert')).toContainText('Insufficient BTC');
    } else
      await expect(panel.getByRole('alert')).toContainText(
        'Loan quote unavailable',
      );
    expect(fixture.submissions()).toBe(0);
  });
}
test('wallet rejection remains recoverable and 320px controls fit', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page, { reject: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await panel
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(panel.getByRole('alert')).toContainText('rejected');
  expect(fixture.submissions()).toBe(0);
  await expect(panel.getByLabel('Saved loan transaction')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: '.tools/loan-actions-mobile.png',
    fullPage: true,
  });
});

test('a wallet network change after review prevents submission', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page);
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toBeVisible();
  await page.evaluate(() => Object.assign(window, { loanWalletChain: '0x1' }));
  await panel
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(panel.getByRole('alert')).toContainText(
    'account or network changed',
  );
  expect(fixture.submissions()).toBe(0);
});
test('an expired review cannot open a wallet prompt', async ({ page }) => {
  const fixture = await installLoanFixture(page);
  await page.clock.install();
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await expect(panel.getByLabel('Review loan action')).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(
    panel.getByRole('button', { name: 'Confirm loan action in wallet' }),
  ).toBeDisabled();
  expect(fixture.submissions()).toBe(0);
});
test('removing pending tracking requires explicit acknowledgement and never cancels or repeats a transaction', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page, { pending: true });
  await page.goto('/borrowing');
  await connectPlannerWallet(page);
  const panel = page.getByRole('region', { name: 'Manage Mezo loan' });
  await panel.getByRole('button', { name: 'Open loan controls' }).click();
  await panel.getByLabel('Receive in wallet').fill('100');
  await panel.getByRole('button', { name: 'Review and simulate' }).click();
  await panel
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(panel.getByLabel('Saved loan transaction')).toBeVisible();
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('does not cancel');
    void dialog.dismiss();
  });
  await panel
    .getByRole('button', { name: 'Remove local loan tracking' })
    .click();
  await expect(panel.getByLabel('Saved loan transaction')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await panel
    .getByRole('button', { name: 'Remove local loan tracking' })
    .click();
  await expect(panel.getByLabel('Saved loan transaction')).toHaveCount(0);
  await expect(panel.getByRole('alert')).toContainText('may still confirm');
  expect(fixture.submissions()).toBe(1);
});
