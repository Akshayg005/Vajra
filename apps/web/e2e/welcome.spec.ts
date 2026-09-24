import { test, expect } from '@playwright/test';
import { openApp, watchConsole } from './helpers';

test('landing page renders every section and opens the Command Center', async ({ page }) => {
  const errors = watchConsole(page);
  await openApp(page, '/welcome');
  await expect(page.getByRole('heading', { name: 'VAJRA' }).first()).toBeVisible();
  await expect(page.getByText('storm cells tracked')).toBeVisible();
  const scroller = page.locator('.overflow-y-auto').first();
  for (const text of ['sees it first', 'From radar echo', 'Real nowcasting logic', 'Pick a storm', 'every 5 minutes', 'rain hits the glass', 'next Nor’wester']) {
    await page.getByText(text).first().scrollIntoViewIfNeeded();
    await expect(page.getByText(text).first()).toBeAttached();
  }
  await scroller.evaluate((el) => el.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Enter Command Center' }).first().click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText(/Tracked storm cells/i)).toBeVisible();
  expect(errors.filter((e) => !/Multiple instances of Three/.test(e))).toEqual([]);
});

test('scenario carousel loads a storm into the engine', async ({ page }) => {
  await openApp(page, '/welcome');
  await page.getByText('Pick a storm').scrollIntoViewIfNeeded();
  const load = page.getByRole('button', { name: /Load this storm/ }).first();
  await load.scrollIntoViewIfNeeded();
  await load.click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('header select').first()).not.toHaveValue('');
});

test('3D storm toggles between realistic cloud and radar volume', async ({ page }) => {
  await openApp(page, '/storm3d');
  await expect(page.getByRole('tab', { name: 'Realistic cloud' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Raymarched cumulonimbus/)).toBeVisible();
  await page.getByRole('tab', { name: 'Radar volume' }).click();
  await expect(page.getByText(/Vertical scale exaggerated/)).toBeVisible();
});
