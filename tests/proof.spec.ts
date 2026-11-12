import { expect, test } from '@playwright/test';
import { installLoanFixture, loanOwner } from './loan-fixture';

test('public funding proof reconciles commitments and cancellation without a wallet', async ({
  page,
}) => {
  await installLoanFixture(page, { proof: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/proof/${loanOwner}/`);
  const totals = page.getByRole('region', { name: 'Funding proof totals' });
  await expect(totals).toContainText('90');
  await expect(totals).toContainText('COMMITTED MUSD');
  await expect(
    page.getByText(
      'Contract balance covers all outstanding obligations at this snapshot.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Escrow evidence' }),
  ).toBeVisible();
  await expect(page.locator('main')).toContainText('60 MUSD');
  await page.reload();
  await expect(totals).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: '.tools/improvements-proof-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('a failed proof row produces explicit subtotals rather than complete proof', async ({
  page,
}) => {
  await installLoanFixture(page, { proof: true, failProofRow: true });
  await page.goto(`/proof/${loanOwner}`);
  await expect(page.getByRole('status')).toContainText('Partial proof');
  await expect(
    page.getByRole('region', { name: 'Funding proof totals' }),
  ).toContainText('LOADED COMMITMENT SUBTOTAL');
});
test('invalid sender addresses cannot trigger a funding proof RPC read', async ({
  page,
}) => {
  let reads = 0;
  await page.route('https://rpc.test.mezo.org/**', (route) => {
    reads++;
    return route.abort();
  });
  await page.goto('/proof/invalid');
  await expect(page.getByRole('alert')).toContainText('valid nonzero sender');
  expect(reads).toBe(0);
});
