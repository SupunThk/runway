import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const origin = process.argv[2] || 'https://mezo-runway-testnet.vercel.app';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function visibleText(selector, expected) {
  await page
    .locator(selector)
    .filter({ hasText: expected })
    .first()
    .waitFor({ timeout: 45000 });
}
try {
  const response = await page.goto(origin);
  if (response.status() !== 200)
    throw new Error(`Homepage HTTP ${response.status()}`);
  await visibleText('h1', 'Your team. Funded forward.');
  await page.goto(`${origin}/schedules/1`);
  await visibleText('.schedule-card .badge', 'COMPLETED');
  await visibleText('.schedule-card', 'Payment complete.');
  await page.reload();
  await visibleText('.schedule-card .badge', 'COMPLETED');
  await page.goto(`${origin}/schedules/2`);
  await visibleText('.schedule-card .badge', 'CANCELLED');
  await visibleText('.schedule-card', '0.371666666666666667 MUSD');
  await visibleText('.schedule-card', '0.628333333333333333 MUSD');
  await visibleText('.schedule-card', 'Cancellation settled.');
  const cardText = await page.locator('.schedule-card').innerText();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'deployments/frontend-mobile.png',
    fullPage: true,
  });
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  if (!fits) throw new Error('Recipient page overflows mobile viewport.');
  if (errors.length) throw new Error(errors.join('\n'));
  const report = {
    checkedAt: new Date().toISOString(),
    origin,
    authenticated: false,
    homepage: 'passed',
    completedSchedule: 'passed',
    cancelledSchedule: 'passed',
    directLinkReload: 'passed',
    mobile: 'passed',
    pageErrors: errors,
    cancelledScheduleText: cardText,
  };
  await writeFile(
    'deployments/frontend.check.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
