import { expect, test, type Page } from '@playwright/test';
import { hexToString } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { startTestBackend } from '../apps/api/test-fixture';

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
