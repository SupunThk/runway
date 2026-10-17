import { expect, test, type Page } from '@playwright/test';
import { hexToString, zeroHash } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { startTestBackend } from '../apps/api/test-fixture';
import {
  indexKey,
  type IndexedSchedule,
  type IndexState,
} from '../apps/api/src/reconciliation';

const account = privateKeyToAccount(generatePrivateKey());
let backend: Awaited<ReturnType<typeof startTestBackend>>;
test.beforeAll(async () => {
  test.setTimeout(600000); // Allow the initial isolated MongoDB binary download.
  backend = await startTestBackend();
});
test.afterAll(async () => {
  await backend?.close();
});

async function wallet(page: Page, reject = false) {
  await page.exposeFunction('signTestLogin', async (message: `0x${string}`) => {
    return account.signMessage({ message: hexToString(message) });
  });
  await page.addInitScript(
    ({ address, reject }) => {
      let connected = false;
      const calls: string[] = [];
      Object.assign(window, { workspaceWalletCalls: calls });
      const provider = {
        on() {},
        removeListener() {},
        async request({
          method,
          params,
        }: {
          method: string;
          params?: string[];
        }) {
          calls.push(method);
          if (method === 'eth_chainId') return '0x7b7b';
          if (method === 'eth_accounts') return connected ? [address] : [];
          if (method === 'wallet_requestPermissions') return [];
          if (method === 'eth_requestAccounts') {
            connected = true;
            return [address];
          }
          if (method === 'personal_sign' && reject)
            throw Object.assign(new Error('User rejected signature.'), {
              code: 4001,
            });
          if (method === 'personal_sign')
            return (
              window as unknown as {
                signTestLogin: (message: string) => Promise<string>;
              }
            ).signTestLogin(params![0]);
          throw new Error(`Unsupported simulated wallet method: ${method}`);
        },
      };
      Object.assign(window, { ethereum: provider });
    },
    { address: account.address, reject },
  );
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${backend.url}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
}
async function connect(page: Page) {
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Choose wallet' })
    .getByRole('button', { name: 'Browser wallet', exact: true })
    .click();
}

test('wallet login → MongoDB workspace/contractor/invoice → reload → prefilled payment', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await wallet(page);
  await page.goto('/workspace');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in with wallet' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign out of workspace' }),
  ).toBeVisible();
  await page.getByLabel('New workspace name').fill('Bitcoin studio');
  await page
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await expect(page.getByLabel('Active workspace')).toContainText(
    'Bitcoin studio',
  );
  await page.getByLabel('Contractor name', { exact: true }).fill('Alex');
  await page
    .getByLabel('Contractor wallet', { exact: true })
    .fill('0x0000000000000000000000000000000000000011');
  await page
    .getByRole('button', { name: 'Save contractor', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Create payment for Alex' }),
  ).toBeVisible();
  await page
    .getByLabel('Invoice contractor', { exact: true })
    .selectOption({ label: 'Alex' });
  await page
    .getByLabel('Invoice description', { exact: true })
    .fill('October design');
  await page
    .getByLabel('Invoice amount (MUSD)', { exact: true })
    .fill('1000.123456789012345678');
  await page.getByLabel('Invoice due date', { exact: true }).fill('2026-11-01');
  await page
    .getByRole('button', { name: 'Save draft invoice', exact: true })
    .click();
  await expect(
    page.getByText('1000.123456789012345678 MUSD · Due 2026-11-01'),
  ).toBeVisible();
  await page.reload();
  if (
    await page
      .getByRole('button', { name: 'Connect wallet', exact: true })
      .isVisible()
  )
    await connect(page);
  await expect(
    page.getByRole('heading', { name: 'October design' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '.tools/workspace-mobile.png',
    fullPage: true,
  });
  const calls = await page.evaluate(
    () =>
      (window as unknown as { workspaceWalletCalls: string[] })
        .workspaceWalletCalls,
  );
  expect(calls).not.toContain('eth_sendTransaction');
  await page
    .getByRole('link', { name: 'Prepare payment', exact: true })
    .click();
  await expect(page.getByLabel('Recipient wallet')).toHaveValue(
    '0x0000000000000000000000000000000000000011',
  );
  await expect(page.locator('input[name="total"]')).toHaveValue(
    '1000.123456789012345678',
  );
  expect(new URL(page.url()).searchParams.get('reference')).toMatch(
    /^0x[0-9a-f]{64}$/,
  );
  const invoice = await backend.db
    .collection('invoices')
    .findOne({ description: 'October design' });
  expect(invoice).toBeTruthy();
  await backend.db.collection<IndexState>('paymentIndex').updateOne(
    { _id: indexKey },
    {
      $set: {
        generation: 'browser',
        ready: true,
        checkedAt: new Date(),
        block: '16084000',
      },
    },
    { upsert: true },
  );
  const indexed: IndexedSchedule = {
    _id: 'browser:1',
    generation: 'browser',
    scheduleId: '1',
    sender: account.address.toLowerCase(),
    recipient: invoice!.recipient,
    total: invoice!.amountBaseUnits,
    claimed: '0',
    cancelled: false,
    vestedAtCancellation: '0',
    referenceHash: invoice!.paymentReference,
  };
  await backend.db
    .collection<IndexedSchedule>('paymentSchedules')
    .insertOne(indexed);
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page.getByText('FUNDED', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View schedule #1' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Prepare payment', exact: true }),
  ).toHaveCount(0);
  await backend.db
    .collection<IndexedSchedule>('paymentSchedules')
    .updateOne(
      { _id: indexed._id },
      { $set: { claimed: '500000000000000000000' } },
    );
  await page.getByRole('button', { name: 'Refresh payment status' }).click();
  await expect(
    page.getByText('PARTIALLY CLAIMED', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Committed: 1000.123456789012345678 MUSD · Claimed: 500 MUSD/,
    ),
  ).toBeVisible();
  await backend.db.collection<IndexedSchedule>('paymentSchedules').updateOne(
    { _id: indexed._id },
    {
      $set: {
        cancelled: true,
        vestedAtCancellation: '600000000000000000000',
      },
    },
  );
  await page.getByRole('button', { name: 'Refresh payment status' }).click();
  await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      /Remaining entitlement: 100 MUSD · Refunded: 400.123456789012345678 MUSD/,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '.tools/reconciliation-mobile.png',
    fullPage: true,
  });
  await backend.db
    .collection<IndexState>('paymentIndex')
    .updateOne({ _id: indexKey }, { $set: { error: 'Rebuilding' } });
  await page.getByRole('button', { name: 'Refresh payment status' }).click();
  await expect(page.getByText('UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View schedule #1' }),
  ).toHaveCount(0);
  await backend.db
    .collection<IndexState>('paymentIndex')
    .updateOne({ _id: indexKey }, { $unset: { error: '' } });
  await backend.db
    .collection('invoices')
    .updateOne({ _id: invoice!._id }, { $unset: { paymentReference: '' } });
  await backend.db
    .collection<IndexedSchedule>('paymentSchedules')
    .updateOne({ _id: indexed._id }, { $set: { referenceHash: zeroHash } });
  await page.getByRole('button', { name: 'Refresh payment status' }).click();
  await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();
  await page.getByLabel('Existing schedule ID for October design').fill('1');
  await page.getByRole('button', { name: 'Link existing schedule' }).click();
  await expect(page.getByText('Confirmed schedule linked.')).toBeVisible();
  await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('login rejection keeps records hidden and offers retry', async ({
  page,
}) => {
  await wallet(page, true);
  await page.goto('/workspace/');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in with wallet' }).click();
  await expect(page.getByRole('status')).toContainText(/rejected/i);
  await expect(
    page.getByRole('button', { name: 'Sign in with wallet' }),
  ).toBeEnabled();
  await expect(page.getByLabel('New workspace name')).toHaveCount(0);
});
