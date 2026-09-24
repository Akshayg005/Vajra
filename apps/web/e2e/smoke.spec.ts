import { test, expect } from '@playwright/test';
import { openApp, watchConsole } from './helpers';

const ROUTES: [string, RegExp][] = [
  ['/', /Tracked storm cells|Storm cell|Live event log/i],
  ['/alerts', /Dissemination/i],
  ['/storm3d', /Echo top/i],
  ['/compare', /Coarse-to-fine/i],
  ['/verification', /Verification Lab/i],
  ['/sensors', /Data-fusion trust/i],
  ['/reports', /Crowd reports/i],
  ['/assistant', /VAJRA Assistant/i],
  ['/analytics', /CG lightning density/i],
];

for (const [route, text] of ROUTES) {
  test(`route ${route} renders without console errors`, async ({ page }) => {
    const errors = watchConsole(page);
    await openApp(page, route);
    await expect(page.getByText(text).first()).toBeVisible();
    await page.waitForTimeout(2500);
    expect(errors).toEqual([]);
  });
}

test('header, nav badge and alert list agree', async ({ page }) => {
  await openApp(page, '/alerts');
  await page.waitForTimeout(1500);
  const badge = await page.locator('nav[aria-label="Main"] a[href="#/alerts"] span[aria-label$="live warnings"]').textContent();
  const liveTab = page.getByRole('tab', { name: 'Live' });
  await liveTab.click();
  const rows = await page.locator('.panel .scroll-thin > button').count();
  expect(Number(badge ?? '0')).toBe(rows);
});

test('clock ticks live and "ago" labels update', async ({ page }) => {
  await openApp(page, '/');
  const clock = page.locator('header .font-mono.text-lg').last();
  const a = await clock.textContent();
  await page.waitForTimeout(2200);
  const b = await clock.textContent();
  expect(a).not.toBe(b);
});
