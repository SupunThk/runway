import { expect, test } from '@playwright/test';

for (const width of [1280, 390, 320]) {
  test(`sidebar stays consistent without document reloads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.evaluate(() => {
      Object.assign(window, { navigationSentinel: 'preserved' });
    });
    const sidebar = page.locator('.sidebar');
    const assertSidebar = async (active: string) => {
      await expect(sidebar.locator('nav').getByRole('link')).toHaveText([
        '↗ Overview',
        '＋ New schedule',
        '▦ Workspace',
        '₿ Borrowing',
        '✦ Assistant',
        '? Documentation',
      ]);
      await expect(sidebar.locator('[aria-current="page"]')).toHaveText(active);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { navigationSentinel: string })
              .navigationSentinel,
        ),
      ).toBe('preserved');
    };
    await assertSidebar('↗ Overview');
    const docsPosition = await sidebar
      .getByRole('link', { name: 'Documentation' })
      .boundingBox();
    const workspacePosition = await sidebar
      .getByRole('link', { name: 'Workspace', exact: true })
      .boundingBox();
    expect(docsPosition!.y).toBeGreaterThan(
      workspacePosition!.y + workspacePosition!.height,
    );
    if (width === 1280) expect(docsPosition!.y).toBeGreaterThan(650);
    await sidebar.getByRole('link', { name: 'Workspace', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your team, in one place.' }),
    ).toBeVisible();
    await assertSidebar('▦ Workspace');
    await sidebar.getByRole('link', { name: 'Borrowing', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Mezo borrowing', exact: true }),
    ).toBeVisible();
    await assertSidebar('₿ Borrowing');
    await sidebar.getByRole('link', { name: 'Workspace', exact: true }).click();
    await sidebar.getByRole('link', { name: 'Documentation' }).click();
    await expect(
      page.getByRole('heading', { name: 'Understand your Runway.' }),
    ).toBeVisible();
    await assertSidebar('? Documentation');
    await page.goBack();
    await expect(page).toHaveURL('/workspace');
    await assertSidebar('▦ Workspace');
    await page.goForward();
    await assertSidebar('? Documentation');
    await sidebar.getByRole('link', { name: 'New schedule' }).click();
    await expect(page.getByLabel('Recipient wallet')).toBeVisible();
    await assertSidebar('＋ New schedule');
    await sidebar.getByRole('link', { name: 'Overview' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your team. Funded forward.' }),
    ).toBeVisible();
    await assertSidebar('↗ Overview');
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `.tools/navigation-${width}.png`,
      fullPage: true,
    });
  });
}

test('borrowing direct links and refresh keep the dedicated page', async ({
  page,
}) => {
  for (const path of ['/borrowing', '/borrowing/']) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: 'Mezo borrowing', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Mezo borrowing', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Mezo borrowing position' }),
    ).toBeVisible();
  }
  await page
    .locator('.sidebar')
    .getByRole('link', { name: 'Overview' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Mezo borrowing position' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'View borrowing' }).click();
  await expect(page).toHaveURL('/borrowing');
  await expect(
    page.getByRole('heading', { name: 'Mezo borrowing', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: '.tools/borrowing-page-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({
    path: '.tools/borrowing-page-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
