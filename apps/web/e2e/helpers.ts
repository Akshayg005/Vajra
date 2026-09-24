import { expect, type Page } from '@playwright/test';

/** Collects console errors and failed requests; ignores the headless GPU driver chatter. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver|GPU stall|WebGL: INVALID_VALUE: texSubImage2D/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export async function openApp(page: Page, hash = '/', extra = '') {
  await page.goto(`/?nointro&seed=1234${extra}#${hash}`);
  await expect(page.getByText('SPINNING UP ENGINE')).toHaveCount(0, { timeout: 30_000 });
}
