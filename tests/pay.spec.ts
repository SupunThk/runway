import { expect, test } from '@playwright/test';
import { startTestBackend } from '../apps/api/test-fixture';
import { installLoanFixture, loanOwner } from './loan-fixture';
import { connectPlannerWallet } from './planner-fixture';
import { randomBytes, randomUUID } from 'node:crypto';
import { zeroHash } from 'viem';
let backend: Awaited<ReturnType<typeof startTestBackend>>,
  paid = false,
  reverted = false;
test.beforeAll(async () => {
  backend = await startTestBackend({
    verifyPaymentRequest: async () => ({
      status: reverted ? 'invalid' : paid ? 'paid' : 'awaiting_confirmation',
      verified: !reverted,
      payer: loanOwner,
      blockNumber: '123440',
      blockHash: zeroHash,
      confirmations: paid ? '16' : '5',
      timestamp: new Date().toISOString(),
    }),
  });
});
test.afterAll(async () => {
  await backend?.close();
});
async function install(
  page: Parameters<typeof installLoanFixture>[0],
  expired = false,
  lowGas = false,
  revertedTransfer = false,
) {
  paid = false;
  reverted = revertedTransfer;
  const fixture = await installLoanFixture(page, { lowGas, revertedTransfer });
  const token = randomBytes(32).toString('base64url');
  await backend.db.collection('paymentRequests').insertOne({
    _id: randomUUID(),
    workspaceId: randomUUID(),
    token,
    recipient: '0x0000000000000000000000000000000000000022',
    amountBaseUnits: '1000000000000000000',
    publicBusinessName: 'Studio client checkout',
    publicMemo: 'Project delivery',
    privateNote: 'PRIVATE NOTE',
    clientLabel: 'PRIVATE LABEL',
    createdAt: new Date(Date.now() - 10000).toISOString(),
    expiresAt: new Date(
      Date.now() + (expired ? -1000 : 86400000),
    ).toISOString(),
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({
        url: backend.url + url.pathname + url.search,
      }),
    });
  });
  return { token, fixture };
}
test('payer sends once, resumes verification after reload and downloads a verified receipt', async ({
  page,
}) => {
  const { token, fixture } = await install(page);
  await page.goto(`/pay/${token}/`);
  await connectPlannerWallet(page);
  await expect(
    page.getByRole('region', { name: 'Client payment details' }),
  ).toContainText('1 MUSD');
  await expect(page.locator('main')).not.toContainText('PRIVATE');
  await page.getByRole('button', { name: 'Pay exact MUSD amount' }).click();
  await expect(
    page.getByRole('region', { name: 'Saved client payment' }),
  ).toBeVisible();
  expect(fixture.submissions()).toBe(1);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Saved client payment' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pay exact MUSD amount' }),
  ).toBeDisabled();
  paid = true;
  await page.getByRole('button', { name: 'Check payment again' }).click();
  await expect(page.getByText('Payment received and verified.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download verified receipt' }),
  ).toBeVisible();
  expect(fixture.submissions()).toBe(1);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: '.tools/improvements-pay-mobile.png',
    fullPage: true,
  });
});
test('expired requests cannot open a new transfer prompt', async ({ page }) => {
  const { token, fixture } = await install(page, true);
  await page.goto(`/pay/${token}`);
  await connectPlannerWallet(page);
  await expect(
    page.getByRole('region', { name: 'Client payment details' }),
  ).toContainText('expired');
  await expect(
    page.getByRole('button', { name: 'Pay exact MUSD amount' }),
  ).toBeDisabled();
  expect(fixture.submissions()).toBe(0);
});
test('payer keeps control when the BTC gas reserve is insufficient', async ({
  page,
}) => {
  const { token, fixture } = await install(page, false, true);
  await page.goto(`/pay/${token}`);
  await connectPlannerWallet(page);
  await page.getByRole('button', { name: 'Pay exact MUSD amount' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Insufficient BTC' }),
  ).toBeVisible();
  expect(fixture.submissions()).toBe(0);
});
test('a confirmed reverted transfer requires explicit acknowledgement before retry', async ({
  page,
}) => {
  const { token, fixture } = await install(page, false, false, true);
  await page.goto(`/pay/${token}`);
  await connectPlannerWallet(page);
  await page.getByRole('button', { name: 'Pay exact MUSD amount' }).click();
  await expect(
    page.getByRole('button', { name: 'Acknowledge reverted transfer' }),
  ).toBeVisible();
  expect(fixture.submissions()).toBe(1);
  await page
    .getByRole('button', { name: 'Acknowledge reverted transfer' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Saved client payment' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Pay exact MUSD amount' }),
  ).toBeEnabled();
  expect(fixture.submissions()).toBe(1);
});
