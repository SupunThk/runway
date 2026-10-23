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
    .getByRole('button', { name: 'New payment', exact: false })
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
  await page.getByRole('link', { name: 'New payment' }).click();
  await expect(page).toHaveURL('/?create=1');
  await expect(
    page.getByRole('heading', { name: 'Make a payment.' }),
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

test('payment type toggles duration and supports minutes through days', async ({
  page,
}) => {
  await page.goto('/?create=1');
  await expect(page.getByLabel('Period unit')).toHaveValue('days');
  for (const [unit, max] of [
    ['minutes', '525600'],
    ['hours', '8760'],
    ['days', '365'],
  ]) {
    await page.getByLabel('Period unit').selectOption(unit);
    await expect(
      page.getByLabel('Payment period', { exact: true }),
    ).toHaveAttribute('max', max);
  }
  await page
    .getByLabel('Recipient wallet')
    .fill('0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09');
  await page.getByLabel('Payment type').selectOption('one-time');
  await expect(page.getByLabel('Payment period', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Period unit')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Send MUSD', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/No approval or claim is needed/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: '.tools/one-time-payment-mobile.png' });
  await page.getByLabel('Payment type').selectOption('schedule');
  await expect(page.getByLabel('Recipient wallet')).toHaveValue(
    '0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09',
  );
  await expect(page.getByLabel('Period unit')).toHaveValue('days');
});

test('invoice links keep the tracked schedule flow', async ({ page }) => {
  await page.goto(`/?create=1&reference=0x${'1'.repeat(64)}`);
  await expect(page.getByLabel('Payment type')).toBeDisabled();
  await expect(
    page.getByText(/This invoice uses a payment schedule/),
  ).toBeVisible();
});

test('one-time invoice links open the direct payment flow', async ({
  page,
}) => {
  await page.goto(
    `/?create=1&paymentType=one-time&workspaceId=workspace&invoiceId=invoice&reference=0x${'1'.repeat(64)}`,
  );
  await expect(page.getByLabel('Payment type')).toHaveValue('one-time');
  await expect(page.getByLabel('Payment type')).toBeDisabled();
  await expect(page.getByLabel('Payment period', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('This invoice will be paid in full with one MUSD transfer.'),
  ).toBeVisible();
});
