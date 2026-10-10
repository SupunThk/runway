import { expect, test } from '@playwright/test';

test('disconnected overview and guarded funding form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your team. Funded forward.' }),
  ).toBeVisible();
  await expect(page.getByText('TESTNET ONLY', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Create schedule', exact: false })
    .first()
    .click();
  await expect(page.getByLabel('Recipient wallet')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Approve & fund schedule' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Install or unlock Rabby, MetaMask',
  );
  expect(errors).toEqual([]);
});

test('recipient deep link and refresh preserve route', async ({ page }) => {
  await page.goto('/schedules/999999999');
  await expect(
    page.getByRole('heading', { name: 'Payment #999999999' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Payment #999999999' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Schedule data unavailable|Could not load schedules:/),
  ).toBeVisible({ timeout: 30000 });
});

test('malformed schedule links have a recovery path', async ({ page }) => {
  await page.goto('/schedules/invalid');
  await expect(
    page.getByRole('heading', { name: 'Schedule link not found' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to overview' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your team. Funded forward.' }),
  ).toBeVisible();
});

test('creating from a recipient link leaves the old schedule route', async ({
  page,
}) => {
  await page.goto('/schedules/1');
  await page.getByRole('link', { name: 'New schedule' }).click();
  await expect(page).toHaveURL('/?create=1');
  await expect(
    page.getByRole('heading', { name: 'Make room for your next hire.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Recipient wallet')).toBeVisible();
});

test('mobile overview fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your team. Funded forward.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
