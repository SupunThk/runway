import { expect, test } from '@playwright/test';
import { startTestBackend } from '../apps/api/test-fixture';

let backend: Awaited<ReturnType<typeof startTestBackend>>;
test.beforeAll(async () => {
  test.setTimeout(120000);
  backend = await startTestBackend({
    assistantModel: {
      async respond({ prompt, onPartial }) {
        onPartial?.();
        const question = JSON.parse(prompt).currentQuestion;
        return question.includes('weather')
          ? {
              scope: 'out_of_scope',
              supported: false,
              paragraphs: [],
              steps: [],
              sourceIds: [],
              links: [],
            }
          : {
              scope: 'knowledge',
              supported: true,
              paragraphs: [
                'Approve MUSD if needed, then create the funded schedule. Approval alone does not pay the contractor.',
              ],
              steps: [
                'Open New payment and choose Payment over time.',
                'Confirm schedule creation in your wallet.',
              ],
              sourceIds: ['funding'],
              links: ['create'],
            };
      },
    },
  });
});
test.afterAll(async () => {
  await backend?.close();
});
test.beforeEach(async ({ page }) => {
  await backend.db.collection('rateLimits').deleteMany({});
  for (const path of ['chat', 'feedback'])
    await page.route(`**/api/assistant/${path}`, async (route) => {
      const response = await route.fetch({
        url: `${backend.url}/api/assistant/${path}`,
      });
      await route.fulfill({ response });
    });
});

test('wallet-free questions through API, sources, follow-up isolation and app navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/assistant');
  await expect(
    page.getByRole('heading', { name: 'What would you like to understand?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Pay a contractor/ }).click();
  await expect(
    page.getByText(
      'Approve MUSD if needed, then create the funded schedule. Approval alone does not pay the contractor.',
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Sources for answer 1' })
      .getByRole('link'),
  ).toHaveAttribute('href', '/docs#fund-a-schedule');
  const input = page.getByLabel('Ask about Runway or Mezo');
  await input.fill('What about approvals?');
  const followup = page.waitForRequest('**/api/assistant/chat');
  await input.press('Enter');
  expect((await followup).postDataJSON().history).toEqual([
    {
      question: 'How do I pay a contractor with Runway?',
      sources: ['funding'],
    },
  ]);
  await expect(
    page
      .getByRole('article', { name: 'Question 2' })
      .getByText('Approval alone', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New chat' }).click();
  await input.fill('What is the weather tomorrow?');
  const fresh = page.waitForRequest('**/api/assistant/chat');
  await page.getByRole('button', { name: 'Send question' }).click();
  expect((await fresh).postDataJSON().history).toEqual([]);
  await expect(
    page.getByText('I can help with Runway and Mezo.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.getByRole('button', { name: /Pay a contractor/ }).click();
  await page
    .getByRole('link', { name: 'New payment', exact: true })
    .last()
    .click();
  await expect(page.getByLabel('Recipient wallet')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/assistant');
  expect(errors).toEqual([]);
});

test('steps, follow-up suggestions, anonymous rating and reload persistence', async ({
  page,
}) => {
  await page.goto('/assistant?from=cancel');
  const first = page.waitForRequest('**/api/assistant/chat');
  await page.getByRole('button', { name: /Pay a contractor/ }).click();
  expect((await first).postDataJSON().context).toBe('cancel');
  const answer = page.getByRole('article', { name: 'Question 1' });
  await expect(answer.getByRole('listitem')).toHaveText([
    'Open New payment and choose Payment over time.',
    'Confirm schedule creation in your wallet.',
  ]);
  await expect(answer.getByText(/^Docs reviewed /)).toBeVisible();
  const feedback = page.waitForRequest('**/api/assistant/feedback');
  await answer.getByRole('button', { name: 'Not helpful' }).click();
  expect((await feedback).postDataJSON()).toEqual({
    rating: 'down',
    sources: ['funding'],
  });
  await expect(answer.getByText('Thanks', { exact: false })).toBeVisible();
  const suggestions = page.getByLabel('Suggested follow-up questions');
  await expect(suggestions.getByRole('button').first()).toBeVisible();
  const next = page.waitForRequest('**/api/assistant/chat');
  await suggestions.getByRole('button').first().click();
  expect((await next).postDataJSON().question).toBe(
    'What happens when I cancel a payment schedule?',
  );
  await expect(page.getByRole('article', { name: 'Question 2' })).toContainText(
    'Approval alone',
  );
  await page.reload();
  await expect(page.getByRole('article', { name: 'Question 2' })).toBeVisible();
  await page.getByRole('button', { name: 'New chat' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'What would you like to understand?' }),
  ).toBeVisible();
});

test('failure, retry, stop and new chat prevent late replies from entering a fresh conversation', async ({
  page,
}) => {
  await page.unroute('**/api/assistant/chat');
  let requests = 0;
  await page.route('**/api/assistant/chat', async (route) => {
    requests++;
    if (requests === 1)
      return route.fulfill({
        status: 503,
        json: { error: 'The assistant is temporarily unavailable.' },
      });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route
      .fulfill({
        json: {
          kind: 'answer',
          paragraphs: ['Late answer'],
          sources: [],
          links: [],
        },
      })
      .catch(() => {});
  });
  await page.goto('/assistant/');
  await page.getByRole('button', { name: /Pay a contractor/ }).click();
  await expect(page.getByRole('alert')).toContainText(
    'temporarily unavailable',
  );
  await page.getByRole('button', { name: 'Retry answer' }).click();
  await page.getByRole('button', { name: 'Stop answer' }).click();
  await expect(page.getByRole('alert')).toContainText('stopped');
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(
    page.getByRole('heading', { name: 'What would you like to understand?' }),
  ).toBeVisible();
  await expect(page.getByText('Late answer')).toHaveCount(0);
});

for (const width of [320, 390, 1440]) {
  test(`assistant direct route, keyboard and layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/assistant/');
    await page.reload();
    await expect(page.locator('.sidebar [aria-current="page"]')).toHaveText(
      'Assistant',
    );
    await expect(
      page.getByRole('button', { name: 'Send question' }),
    ).toBeDisabled();
    await page
      .getByLabel('Ask about Runway or Mezo')
      .fill('<script>untrusted user text</script>');
    await page.getByLabel('Ask about Runway or Mezo').press('Shift+Enter');
    await expect(page.getByLabel('Ask about Runway or Mezo')).toHaveValue(
      '<script>untrusted user text</script>\n',
    );
    await page.getByRole('button', { name: 'New chat' }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.tools/assistant-${width}.png`,
      fullPage: true,
    });
  });
}
