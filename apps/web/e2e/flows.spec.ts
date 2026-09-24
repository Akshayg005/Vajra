import { test, expect, devices } from '@playwright/test';
import { openApp, watchConsole } from './helpers';

test('alert issue flow: suppress then issue shows forecaster + counters', async ({ page }) => {
  await openApp(page, '/alerts');
  const first = page.locator('.panel .scroll-thin > button').first();
  await first.click();
  const suppress = page.getByRole('button', { name: /Suppress/ });
  if (await suppress.isVisible()) {
    await suppress.click();
    await expect(page.getByText('SUPPRESSED', { exact: false }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /Issue warning/ }).click();
  await expect(page.getByText('issued by forecaster')).toBeVisible();
  await expect(page.getByText('SMS (cell broadcast)').first()).toBeVisible();
});

test('CAP XML and CSV downloads', async ({ page }) => {
  await openApp(page, '/alerts');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export CSV/ }).click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const [cap] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CAP XML/ }).click()]);
  expect(cap.suggestedFilename()).toMatch(/\.cap\.xml$/);
});

test('assistant answers from live engine state', async ({ page }) => {
  await openApp(page, '/assistant');
  await page.getByLabel('Question').fill('Will lightning hit Kolkata in the next hour?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Kolkata.*\d+\.\d%/).last()).toBeVisible();
});

test('Director Mode: Shift+D opens, trigger fires an event', async ({ page }) => {
  await openApp(page, '/');
  await page.keyboard.press('Shift+D');
  await expect(page.getByText('Director Mode')).toBeVisible();
  await page.getByRole('button', { name: /Pulse strongest cell/ }).click();
  await expect(page.getByText(/Director: forced updraft pulse/).first()).toBeVisible();
});

test('worker crash auto-recovers with the same seed', async ({ page }) => {
  const errors = watchConsole(page);
  await openApp(page, '/');
  await page.keyboard.press('Shift+D');
  await page.getByRole('button', { name: /Crash the engine worker/ }).click();
  await expect(page.getByText('Engine auto-restarted')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(errors.filter((e) => !/worker crash \(simulated\)/.test(e))).toEqual([]);
});

test('works fully offline (no external requests needed)', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      external.push(u.href);
      return route.abort();
    }
    return route.continue();
  });
  const errors = watchConsole(page);
  await openApp(page, '/');
  await expect(page.getByText('Tracked storm cells')).toBeVisible();
  await page.waitForTimeout(3000);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('citizen view on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: devices['iPhone 13'].userAgent });
  test('Am I safe? renders at 390 px with dial, 30-30 and personas', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?seed=1234#/public');
    await expect(page.getByText('Am I safe?')).toBeVisible();
    await expect(page.getByRole('img', { name: /Thunderstorm risk/ })).toBeVisible();
    await expect(page.getByText('30-30 rule')).toBeVisible();
    await page.getByRole('tab', { name: 'Fisher' }).click();
    await expect(page.getByText(/Return to shore/)).toBeVisible();
    await page.getByLabel('Language').selectOption('hi');
    await expect(page.getByText('क्या मैं सुरक्षित हूँ?')).toBeVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });
});
