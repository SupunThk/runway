import { expect, test } from '@playwright/test';
import { installLoanFixture } from './loan-fixture';
import { connectPlannerWallet } from './planner-fixture';

test('saved payment terms survive borrowing, reload and funding without repeating the loan', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page);
  await page.goto('/?create=1');
  await connectPlannerWallet(page);
  await page
    .getByLabel('Recipient wallet', { exact: true })
    .fill('0x0000000000000000000000000000000000000022');
  await page.getByLabel('Total funding').fill('1100');
  await page.getByLabel('Payment period').fill('2');
  await page.getByLabel('Period unit').selectOption('hours');
  await page
    .getByRole('button', { name: 'Save as a payment plan for later' })
    .click();
  const saved = page.getByRole('region', { name: 'Saved funding plan' });
  await expect(saved).toContainText('1100 MUSD');
  await saved
    .getByRole('link', { name: 'Review borrowing for the funding gap' })
    .click();
  const controls = page.getByRole('region', { name: 'Manage Mezo loan' });
  await expect(controls.getByLabel('Receive in wallet')).toHaveValue('100');
  await controls.getByRole('button', { name: 'Review and simulate' }).click();
  await controls
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(controls.getByLabel('Saved loan transaction')).toContainText(
    'Loan transaction confirmed',
  );
  await page.reload();
  await expect(saved).toContainText('Borrowed; payment not yet funded');
  expect(fixture.submissions()).toBe(1);
  await controls
    .getByRole('link', { name: 'Continue funding this payment' })
    .click();
  await expect(
    page.getByLabel('Recipient wallet', { exact: true }),
  ).toHaveValue('0x0000000000000000000000000000000000000022');
  await expect(page.getByLabel('Total funding')).toHaveValue('1100');
  await expect(page.getByLabel('Payment period')).toHaveValue('120');
  await page.getByRole('button', { name: 'Approve & fund schedule' }).click();
  await expect(saved).toContainText('Payment funding confirmed');
  expect(fixture.submissions()).toBe(3);
  await page.reload();
  await expect(saved).toContainText('Payment funding confirmed');
  await expect(
    page.getByRole('button', { name: 'Approve & fund schedule' }),
  ).toBeDisabled();
  await expect(
    page.getByText('This plan already has a payment transaction.', {
      exact: false,
    }),
  ).toBeVisible();
  expect(fixture.submissions()).toBe(3);
});

test('rejected funding preserves the borrowed result and confirmed allowance across reload', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page, { rejectFunding: true });
  await page.goto('/?create=1');
  await connectPlannerWallet(page);
  await page
    .getByLabel('Recipient wallet', { exact: true })
    .fill('0x0000000000000000000000000000000000000022');
  await page.getByLabel('Total funding').fill('1100');
  await page
    .getByRole('button', { name: 'Save as a payment plan for later' })
    .click();
  await page
    .getByRole('link', { name: 'Review borrowing for the funding gap' })
    .click();
  const controls = page.getByRole('region', { name: 'Manage Mezo loan' });
  await controls.getByRole('button', { name: 'Review and simulate' }).click();
  await controls
    .getByRole('button', { name: 'Confirm loan action in wallet' })
    .click();
  await expect(controls.getByLabel('Saved loan transaction')).toContainText(
    'Loan transaction confirmed',
  );
  await controls
    .getByRole('link', { name: 'Continue funding this payment' })
    .click();
  await page.getByRole('button', { name: 'Approve & fund schedule' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /rejected/i }),
  ).toBeVisible();
  expect(fixture.submissions()).toBe(2);
  await page.reload();
  const saved = page.getByRole('region', { name: 'Saved funding plan' });
  await expect(saved).toContainText('Borrowed; payment not yet funded');
  await expect(
    saved.getByRole('listitem').filter({ hasText: 'Approve' }),
  ).toContainText('confirmed');
  expect(fixture.submissions()).toBe(2);
});

test('a saved one-time plan pays once without requiring an invoice reference', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page);
  await page.goto('/?create=1');
  await connectPlannerWallet(page);
  await page
    .getByRole('combobox', { name: 'Payment type', exact: true })
    .selectOption('one-time');
  await page
    .getByLabel('Recipient wallet', { exact: true })
    .fill('0x0000000000000000000000000000000000000022');
  await page.getByLabel('Amount · MUSD', { exact: true }).fill('1');
  await page
    .getByRole('button', { name: 'Save as a payment plan for later' })
    .click();
  await page.getByRole('button', { name: 'Send MUSD', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Saved funding plan' }),
  ).toContainText('Payment confirmed');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Send MUSD', exact: true }),
  ).toBeDisabled();
  expect(fixture.submissions()).toBe(1);
});

test('borrowing the shortfall includes the on-chain schedule fee and funds with a max fee', async ({
  page,
}) => {
  const fixture = await installLoanFixture(page, { scheduleFees: true });
  await page.goto('/?create=1');
  await connectPlannerWallet(page);
  await page
    .getByLabel('Recipient wallet', { exact: true })
    .fill('0x0000000000000000000000000000000000000022');
  await page.getByLabel('Total funding').fill('1100');
  await page.getByLabel('Payment period').fill('2');
  await page.getByLabel('Period unit').selectOption('hours');
  const cost = page.getByLabel('Schedule cost');
  await expect(cost).toContainText('2.75 MUSD');
  await expect(cost).toContainText('1102.75 MUSD');
  await page
    .getByRole('button', { name: 'Borrow the shortfall against BTC' })
    .click();
  const controls = page.getByRole('region', { name: 'Manage Mezo loan' });
  // 1,100 + 2.75 fee - 1,000 wallet MUSD.
  await expect(controls.getByLabel('Receive in wallet')).toHaveValue('102.75');
  const saved = page.getByRole('region', { name: 'Saved funding plan' });
  await expect(saved).toContainText('102.75 MUSD short');
  expect(fixture.submissions()).toBe(0);
});
