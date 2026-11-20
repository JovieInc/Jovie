/**
 * Homepage hydration (visual stability) guard.
 *
 * https://jov.ie/ threw React #418 on every fresh visit because the
 * prerendered shell rendered pathname-derived chrome (footer CTA, page
 * contract marker, header CTA) differently on the server than in the browser.
 * The client re-render flashes the first screen of the golden path.
 */
import { expect, test } from '@playwright/test';
import { isHydrationMismatch } from '../helpers/hydration-guard';

test.use({ storageState: { cookies: [], origins: [] } });

test('homepage hydrates without a mismatch and keeps its chrome stable', async ({
  page,
}) => {
  const mismatches: string[] = [];
  page.on('pageerror', error => {
    if (isHydrationMismatch(error.message)) mismatches.push(error.message);
  });
  page.on('console', message => {
    if (message.type() === 'error' && isHydrationMismatch(message.text())) {
      mismatches.push(message.text());
    }
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  expect(mismatches).toEqual([]);
  // The homepage owns its final CTA: no footer CTA section after hydration.
  await expect(page.getByTestId('marketing-footer-cta')).toHaveCount(0);
  await expect(
    page
      .getByTestId('header-nav')
      .getByRole('link', { name: 'Claim your profile' })
  ).toHaveAttribute('href', '/start');
});
