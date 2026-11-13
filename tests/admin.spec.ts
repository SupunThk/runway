import { expect, test, type Page } from '@playwright/test';
import { hexToString } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { startTestBackend } from '../apps/api/test-fixture';
import { recordWorkspaceActivity } from '../apps/api/src/admin-metrics';
import {
  indexKey,
  type IndexState,
  type IndexedSchedule,
} from '../apps/api/src/reconciliation';

const admin = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
let backend: Awaited<ReturnType<typeof startTestBackend>>;
test.beforeAll(async () => {
  test.setTimeout(600000);
  backend = await startTestBackend({ adminWallets: [admin.address] });
  await backend.db
    .collection('workspaces')
    .insertOne({ owner: admin.address.toLowerCase(), name: 'PRIVATE COMPANY' });
  await backend.db
    .collection('contractors')
    .insertOne({ name: 'PRIVATE CONTRACTOR', address: other.address });
  await backend.db.collection('invoices').insertOne({
    description: 'PRIVATE DESCRIPTION',
    amountBaseUnits: '100000000000000000000',
  });
  await recordWorkspaceActivity(backend.db, admin.address, new Date());
  const U = 10n ** 18n;
  await backend.db.collection<IndexState>('paymentIndex').insertOne({
    _id: indexKey,
    generation: 'admin-test',
    block: '123456',
    hash: `0x${'11'.repeat(32)}`,
    ready: true,
    checkedAt: new Date(),
  });
  await backend.db.collection<IndexedSchedule>('paymentSchedules').insertOne({
    _id: 'admin-schedule',
    generation: 'admin-test',
    scheduleId: '1',
    sender: admin.address,
    recipient: other.address,
    total: (100n * U).toString(),
    claimed: (25n * U).toString(),
    cancelled: false,
    vestedAtCancellation: '0',
    referenceHash: `0x${'00'.repeat(32)}`,
  });
});
test.afterAll(async () => {
  await backend?.close();
});
async function install(page: Page, account = admin, reject = false) {
  await page.exposeFunction('signAdminLogin', (message: `0x${string}`) =>
    account.signMessage({ message: hexToString(message) }),
  );
  await page.addInitScript(
    ({ address, reject }) => {
      let connected = sessionStorage.getItem('admin-test-connected') === '1';
      const listeners = new Map<string, ((value: unknown) => void)[]>();
      const provider = {
        on(event: string, fn: (value: unknown) => void) {
          listeners.set(event, [...(listeners.get(event) ?? []), fn]);
        },
        removeListener() {},
        async request({
          method,
          params,
        }: {
          method: string;
          params?: string[];
        }) {
          if (method === 'eth_chainId') return '0x7b7b';
          if (method === 'eth_accounts') return connected ? [address] : [];
          if (method === 'wallet_requestPermissions') return [];
          if (method === 'eth_requestAccounts') {
            connected = true;
            sessionStorage.setItem('admin-test-connected', '1');
            return [address];
          }
          if (method === 'personal_sign') {
            if (reject)
              throw Object.assign(new Error('User rejected signature.'), {
                code: 4001,
              });
            return (
              window as unknown as {
                signAdminLogin: (message: string) => Promise<string>;
              }
            ).signAdminLogin(params![0]);
          }
          throw new Error(`Unexpected wallet method ${method}`);
        },
      };
      Object.assign(window, {
        ethereum: provider,
        switchAdminTestWallet: () => {
          address = '0x0000000000000000000000000000000000000099';
          listeners.get('accountsChanged')?.forEach((fn) => fn([address]));
        },
      });
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
    .getByRole('button', { name: 'Browser wallet', exact: true })
    .click();
}
test('authorized wallet signs in, sees real aggregates, reloads, filters and signs out', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await install(page);
  await page.goto('/admin/');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in as admin' }).click();
  await expect(
    page.getByRole('region', { name: 'Admin summary' }),
  ).toContainText('Not collecting fees');
  const payments = page.getByRole('region', { name: 'Payment activity' });
  await expect(payments).toContainText('100 MUSD');
  await expect(payments).toContainText('25 MUSD');
  await expect(payments).toContainText('75 MUSD');
  await expect(page.locator('main')).not.toContainText('PRIVATE COMPANY');
  await expect(page.locator('main')).not.toContainText('PRIVATE CONTRACTOR');
  await expect(page.locator('main')).not.toContainText('PRIVATE DESCRIPTION');
  await page.getByLabel('Activity period').selectOption('7');
  await expect(
    page.getByRole('region', { name: 'Workspace activity' }),
  ).toContainText('Active wallets · 7 days');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Admin summary' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.tools/admin-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({ path: '.tools/admin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out of admin' }).click();
  await expect(page.getByRole('region', { name: 'Admin summary' })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      async () => (await fetch('/api/admin/overview')).status,
    ),
  ).toBe(401);
  expect(errors).toEqual([]);
});
test('an ordinary signed-in wallet cannot load admin metrics through the page or API', async ({
  page,
}) => {
  await install(page, other);
  await page.goto('/admin');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in as admin' }).click();
  await expect(page.getByRole('alert')).toContainText('not authorized');
  await expect(page.getByRole('region', { name: 'Admin summary' })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      async () => (await fetch('/api/admin/overview')).status,
    ),
  ).toBe(403);
});
test('switching accounts immediately hides authorized dashboard data', async ({
  page,
}) => {
  await install(page);
  await page.goto('/admin');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in as admin' }).click();
  await expect(
    page.getByRole('region', { name: 'Admin summary' }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { switchAdminTestWallet: () => void }
    ).switchAdminTestWallet(),
  );
  await expect(page.getByRole('region', { name: 'Admin summary' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Sign in as admin' }),
  ).toBeVisible();
});
test('a failed refresh keeps the last snapshot marked stale, and denial hides it', async ({
  page,
}) => {
  await install(page);
  await page.goto('/admin');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in as admin' }).click();
  await expect(
    page.getByRole('region', { name: 'Admin summary' }),
  ).toBeVisible();
  await page.route('**/api/admin/overview?*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Metrics temporarily unavailable.' },
    }),
  );
  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText('Metrics unavailable');
  await expect(page.getByRole('alert')).toContainText('may be stale');
  await expect(
    page.getByRole('region', { name: 'Admin summary' }),
  ).toBeVisible();
  await page.unroute('**/api/admin/overview?*');
  await page.route('**/api/admin/overview?*', (route) =>
    route.fulfill({
      status: 403,
      json: { error: 'This wallet is not authorized for the admin dashboard.' },
    }),
  );
  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText('hidden');
  await expect(page.getByRole('region', { name: 'Admin summary' })).toHaveCount(
    0,
  );
});
test('rejected signatures do not grant admin access', async ({ page }) => {
  await install(page, admin, true);
  await page.goto('/admin');
  await connect(page);
  await page.getByRole('button', { name: 'Sign in as admin' }).click();
  await expect(page.getByRole('alert')).toContainText('rejected');
  await expect(page.getByRole('region', { name: 'Admin summary' })).toHaveCount(
    0,
  );
});
