import { expect, test, type Page } from '@playwright/test';
import { hexToString } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { startTestBackend } from '../apps/api/test-fixture';

const owner = privateKeyToAccount(generatePrivateKey());
const contractor = privateKeyToAccount(generatePrivateKey());
const reviewer = privateKeyToAccount(generatePrivateKey());
let backend: Awaited<ReturnType<typeof startTestBackend>>;
test.beforeAll(async () => {
  backend = await startTestBackend({ verifyDirectPayment: async () => 'paid' });
});
test.afterAll(async () => {
  await backend?.close();
});
test.use({ actionTimeout: 10000 });
async function signIn(page: Page, account = owner) {
  await page.exposeFunction('teamTestSign', (message: `0x${string}`) =>
    account.signMessage({ message: hexToString(message) }),
  );
  await page.addInitScript(
    ({ address }) => {
      let connected =
        sessionStorage.getItem('runway-team-test-connected') === '1';
      Object.assign(window, {
        ethereum: {
          on() {},
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
              sessionStorage.setItem('runway-team-test-connected', '1');
              return [address];
            }
            if (method === 'personal_sign')
              return (
                window as unknown as {
                  teamTestSign: (message: string) => Promise<string>;
                }
              ).teamTestSign(params![0]);
            throw new Error(`Unsupported test wallet call: ${method}`);
          },
        },
      });
    },
    { address: account.address },
  );
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${backend.url}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.goto('/workspace');
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Choose wallet' })
    .getByRole('button', { name: 'Browser wallet', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Sign in with wallet', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Sign out of workspace' }),
  ).toBeVisible();
}
async function createWorkspace(page: Page, name: string) {
  await page.getByLabel('New workspace name').fill(name);
  await page
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await expect(page.getByLabel('Active workspace')).toContainText(name);
  await page
    .getByLabel('Contractor name', { exact: true })
    .fill('Team contractor');
  await page
    .getByLabel('Contractor wallet', { exact: true })
    .fill(contractor.address);
  await page
    .getByRole('button', { name: 'Save contractor', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Create payment for Team contractor' }),
  ).toBeVisible();
}
test('contractor submits, two wallets review, owner prepares payroll and verified payment progress survives reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await signIn(page);
  await createWorkspace(page, 'Team approval studio');
  const operations = page.getByRole('region', {
    name: 'Team treasury operations',
  });
  await operations
    .getByText('Team access & approval policy', { exact: true })
    .click();
  await operations.getByLabel('Invited wallet').fill(reviewer.address);
  await operations
    .getByLabel('Workspace role', { exact: true })
    .selectOption('approver');
  await operations
    .getByRole('button', { name: 'Create wallet invitation' })
    .click();
  await operations.getByLabel('Required workspace approvals').fill('2');
  await operations
    .getByRole('button', { name: 'Update approval policy' })
    .click();
  await expect(
    operations.getByRole('status').filter({ hasText: 'Policy updated.' }),
  ).toBeVisible();
  const contractorContext = await browser.newContext();
  const contractorPage = await contractorContext.newPage();
  await signIn(contractorPage, contractor);
  const participation = contractorPage.getByRole('region', {
    name: 'Invitations and contractor invoices',
  });
  await participation
    .getByText('Submit a contractor invoice', { exact: true })
    .click();
  await participation
    .getByLabel('Submitted invoice description')
    .fill('Reviewed delivery');
  await participation
    .getByLabel('Submitted invoice MUSD')
    .fill('12.000000000000000001');
  await participation
    .getByLabel('Submitted invoice due date')
    .fill('2026-11-10');
  await participation
    .getByLabel('Submitted invoice payment type')
    .selectOption('one-time');
  await participation
    .getByRole('button', { name: 'Submit invoice for review' })
    .click();
  await expect(
    participation.getByRole('heading', { name: 'Reviewed delivery' }),
  ).toBeVisible();
  await expect(
    contractorPage.getByRole('region', { name: 'Team treasury operations' }),
  ).toHaveCount(0);
  await operations
    .getByRole('button', { name: 'Refresh team operations' })
    .click();
  await operations.getByText('Invoice review queue', { exact: true }).click();
  await operations
    .getByRole('button', { name: 'Approve Reviewed delivery', exact: true })
    .click();
  await expect(operations.getByText(/1\/2 approvals/)).toBeVisible();
  await expect(
    operations.getByRole('link', {
      name: 'Review payment for Reviewed delivery',
    }),
  ).toHaveCount(0);
  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  await signIn(reviewerPage, reviewer);
  await reviewerPage
    .getByRole('button', { name: 'Accept invitation to Team approval studio' })
    .click();
  const reviewerOps = reviewerPage.getByRole('region', {
    name: 'Team treasury operations',
  });
  await reviewerOps.getByText('Invoice review queue', { exact: true }).click();
  await reviewerOps
    .getByRole('button', { name: 'Approve Reviewed delivery', exact: true })
    .click();
  await expect(reviewerOps.getByText(/2\/2 approvals/)).toBeVisible();
  await operations
    .getByRole('button', { name: 'Refresh team operations' })
    .click();
  await operations.getByText('Payroll runs', { exact: true }).click();
  await operations.getByLabel('Payroll run name').fill('Delivery payroll');
  await operations
    .getByRole('checkbox', {
      name: 'Reviewed delivery · 12.000000000000000001 MUSD',
    })
    .check();
  await operations
    .getByRole('button', { name: 'Prepare payroll run', exact: true })
    .click();
  await operations
    .getByRole('button', { name: 'Approve run Delivery payroll' })
    .click();
  await reviewerOps
    .getByRole('button', { name: 'Refresh team operations' })
    .click();
  await reviewerOps.getByText('Payroll runs', { exact: true }).click();
  await reviewerOps
    .getByRole('button', { name: 'Approve run Delivery payroll' })
    .click();
  await operations
    .getByRole('button', { name: 'Refresh team operations' })
    .click();
  await operations
    .getByRole('button', { name: 'Review payments in Delivery payroll' })
    .click();
  await expect(
    operations.getByRole('region', { name: 'Reviewed payroll payments' }),
  ).toContainText('12.000000000000000001 MUSD');
  const payment = await page.evaluate(async () => {
    const records = await (await fetch('/api/workspaces')).json();
    const workspaceId = records.items.find(
      (w: { name: string }) => w.name === 'Team approval studio',
    )._id;
    const data = await (
      await fetch(`/api/workspaces/${workspaceId}/operations`)
    ).json();
    const invoice = data.invoices.find(
      (i: { description: string }) => i.description === 'Reviewed delivery',
    );
    return (
      await fetch(
        `/api/workspaces/${workspaceId}/invoices/${invoice._id}/payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionHash: `0x${'d'.repeat(64)}` }),
        },
      )
    ).status;
  });
  expect(payment).toBe(200);
  await page.reload();
  await operations.getByText('Payroll runs', { exact: true }).click();
  await expect(
    operations.getByRole('heading', { name: 'Delivery payroll' }),
  ).toBeVisible();
  await expect(operations).toContainText('1 settled');
  await contractorContext.close();
  await reviewerContext.close();
});
test('recurring preparation, forecast cash risk, opt-in reminders and audit reports work on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await signIn(page);
  await createWorkspace(page, 'Recurring studio');
  const operations = page.getByRole('region', {
    name: 'Team treasury operations',
  });
  await operations
    .getByText('Recurring payment plans', { exact: true })
    .click();
  await operations.getByLabel('Recurring description').fill('Monthly work');
  await operations.getByLabel('Recurring MUSD amount').fill('25');
  await operations.getByLabel('Next recurring due date').fill('2026-01-31');
  await operations
    .getByLabel('Recurring payment type')
    .selectOption('one-time');
  await operations
    .getByRole('button', { name: 'Create recurring plan' })
    .click();
  await expect(
    operations.getByText('Missed date — awaiting preparation'),
  ).toBeVisible();
  await operations
    .getByRole('button', { name: 'Prepare 2026-01-31 invoice', exact: true })
    .click();
  await expect(
    operations.getByRole('button', {
      name: 'Prepare 2026-02-28 invoice',
      exact: true,
    }),
  ).toBeVisible();
  await operations
    .getByRole('button', { name: 'Pause Monthly work', exact: true })
    .click();
  await expect(
    operations.getByRole('button', {
      name: 'Prepare 2026-02-28 invoice',
      exact: true,
    }),
  ).toBeDisabled();
  const forecast = page.getByRole('region', {
    name: 'Dated treasury forecast',
  });
  await forecast.getByLabel('Assumed wallet MUSD').fill('100');
  await forecast.getByLabel('Forecast repayment reserve').fill('10');
  await forecast.getByRole('button', { name: 'Update forecast' }).click();
  await expect(forecast).toContainText('65 MUSD');
  await operations.getByText('Reminders & reports', { exact: true }).click();
  await operations.getByLabel('Enable in-app payment reminders').check();
  await operations
    .getByRole('button', { name: 'Save reminder preferences' })
    .click();
  await expect(operations).toContainText('overdue: Monthly work');
  await expect(
    operations.getByRole('link', { name: 'Download workspace report CSV' }),
  ).toHaveAttribute('href', /report\.csv$/);
  await expect(
    operations.getByRole('cell', {
      name: 'notification-preferences',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '.tools/team-operations-mobile.png',
    fullPage: true,
  });
});
