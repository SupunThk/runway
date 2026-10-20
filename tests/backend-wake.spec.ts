import { expect, test } from '@playwright/test';
import {
  connectPlannerWallet,
  installPlannerFixture,
  plannerAccount,
} from './planner-fixture';

test('Workspace wakes through gateway failures and refetches the session', async ({
  page,
}) => {
  await page.clock.install();
  await installPlannerFixture(page);
  let sessions = 0,
    health = 0;
  await page.route('**/api/auth/session', (route) =>
    ++sessions <= 2
      ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' })
      : route.fulfill({ status: 401, json: { error: 'Sign in' } }),
  );
  await page.route('**/api/health', (route) =>
    ++health === 1
      ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' })
      : route.fulfill({ json: { status: 'ready', database: 'connected' } }),
  );
  await page.goto('/workspace');
  await connectPlannerWallet(page);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in with wallet' }),
  ).toBeDisabled();
  await page.clock.runFor(3001);
  await expect(
    page.getByRole('button', { name: 'Sign in with wallet' }),
  ).toBeEnabled();
  await expect.poll(() => sessions).toBe(3);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toHaveCount(0);
});

test('wake attempts stop at 90 seconds and Retry connection restarts polling', async ({
  page,
}) => {
  await page.clock.install();
  await installPlannerFixture(page);
  let health = 0;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' }),
  );
  await page.route('**/api/health', (route) => {
    health++;
    return route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: 'Waking',
    });
  });
  await page.goto('/workspace');
  await connectPlannerWallet(page);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toBeVisible();
  await page.clock.runFor(90001);
  await expect(page.getByRole('alert')).toContainText(
    'The backend is still unavailable.',
  );
  const before = health;
  await page
    .getByRole('button', { name: 'Retry connection', exact: true })
    .click();
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toBeVisible();
  await expect.poll(() => health).toBeGreaterThan(before);
});

test('JSON database failure is distinguished from a sleeping backend', async ({
  page,
}) => {
  await installPlannerFixture(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 503, contentType: 'text/html', body: 'Waking' }),
  );
  await page.route('**/api/health', (route) =>
    route.fulfill({
      status: 503,
      json: { status: 'unavailable', database: 'unavailable' },
    }),
  );
  await page.goto('/workspace');
  await connectPlannerWallet(page);
  await expect(page.getByRole('alert')).toContainText(
    'Backend is awake but its database is unavailable.',
  );
});

test('Assistant timeout restores the prompt and never automatically resends it', async ({
  page,
}) => {
  await page.clock.install();
  let chats = 0,
    health = 0;
  await page.route('**/api/assistant/chat', async (route) => {
    chats++;
    if (chats > 1)
      await route.fulfill({
        json: {
          kind: 'answer',
          paragraphs: ['Ready answer.'],
          sources: [],
          links: [],
        },
      });
  });
  await page.route('**/api/health', (route) =>
    ++health === 1
      ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' })
      : route.fulfill({ json: { status: 'ready', database: 'connected' } }),
  );
  await page.goto('/assistant');
  const input = page.getByLabel('Ask about Runway or Mezo');
  await input.fill('How do schedules work?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect.poll(() => chats).toBe(1);
  await page.clock.runFor(65001);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toBeVisible();
  await expect(input).toHaveValue('How do schedules work?');
  await page.clock.runFor(3001);
  await expect(
    page.getByText(
      'The backend is ready. Send your question when you are ready.',
    ),
  ).toBeVisible();
  expect(chats).toBe(1);
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('Ready answer.')).toBeVisible();
  expect(chats).toBe(2);
});

test('a failed signed-in record read wakes and refreshes without exposing internal error codes', async ({
  page,
}) => {
  await page.clock.install();
  await installPlannerFixture(page);
  let records = 0,
    health = 0;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { address: plannerAccount } }),
  );
  await page.route('**/api/workspaces', (route) =>
    ++records === 1
      ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' })
      : route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.route('**/api/health', (route) =>
    ++health === 1
      ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' })
      : route.fulfill({ json: { status: 'ready', database: 'connected' } }),
  );
  await page.goto('/workspace');
  await connectPlannerWallet(page);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('BACKEND_WAKING', { exact: false })).toHaveCount(
    0,
  );
  await page.clock.runFor(3001);
  await expect.poll(() => records).toBe(2);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toHaveCount(0);
});

test('a healthy health endpoint cannot cause endless automatic session retries', async ({
  page,
}) => {
  await page.clock.install();
  await installPlannerFixture(page);
  let sessions = 0;
  await page.route('**/api/auth/session', (route) => {
    sessions++;
    return route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: 'Gateway unavailable',
    });
  });
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ready', database: 'connected' } }),
  );
  await page.goto('/workspace');
  await connectPlannerWallet(page);
  await expect(page.getByRole('alert')).toContainText(
    'The backend is still unavailable.',
  );
  expect(sessions).toBe(3);
  await page.clock.runFor(90001);
  expect(sessions).toBe(3);
  await page
    .getByRole('button', { name: 'Retry connection', exact: true })
    .click();
  await expect.poll(() => sessions).toBe(4);
});

test('leaving a waking route cancels its polling and timers', async ({
  page,
}) => {
  await page.clock.install();
  await installPlannerFixture(page);
  let health = 0;
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: 'Waking' }),
  );
  await page.route('**/api/health', (route) => {
    health++;
    return route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: 'Waking',
    });
  });
  await page.goto('/workspace');
  await connectPlannerWallet(page);
  await expect(
    page.getByText('Waking the Runway backend…', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your team. Funded forward.' }),
  ).toBeVisible();
  const before = health;
  await page.clock.runFor(90001);
  expect(health).toBe(before);
});
