import { expect, test } from '@playwright/test';

/**
 * Public profile smoke test — regression net for every deploy (JOV-1653).
 *
 * Validates the PUBLIC-facing profile page renders correctly and fast.
 * Anonymous visitor; no auth; no API mocks.
 *
 * Asserts:
 *  - 200 response (not 404, not redirect loop)
 *  - Page loads within LOAD_BUDGET_MS
 *  - Artist display name renders (h1 visible, non-empty)
 *  - At least one DSP link is visible (Spotify / Apple Music / etc.)
 *  - At least one action affordance (tip / contact / listen mode)
 *  - Captures a screenshot as a test artifact
 *
 * Intentionally does NOT assert on CSS / design values (per JOV-1381 learnings).
 *
 * Run against production:
 *   BASE_URL=https://jov.ie pnpm exec playwright test public-profile-smoke \
 *     --project=chromium
 *
 * @smoke @critical
 */

test.use({ storageState: { cookies: [], origins: [] } });

const PROFILE_HANDLE = process.env.SMOKE_PROFILE_HANDLE ?? 'timwhite';
const LOAD_BUDGET_MS = Number(process.env.SMOKE_LOAD_BUDGET_MS ?? '3000');

test('public profile renders core elements within budget', async ({ page }) => {
  test.setTimeout(60_000);

  // Listen mode surfaces DSP links; default mode often hides them behind a
  // tab selector. Fan flow lands here from outreach messages.
  const start = Date.now();
  const response = await page.goto(`/${PROFILE_HANDLE}?mode=listen`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  const elapsedMs = Date.now() - start;

  expect(
    response?.status() ?? 0,
    `/${PROFILE_HANDLE} returned ${response?.status()} — expected 200`
  ).toBe(200);

  expect(
    elapsedMs,
    `/${PROFILE_HANDLE} took ${elapsedMs}ms, budget ${LOAD_BUDGET_MS}ms`
  ).toBeLessThan(LOAD_BUDGET_MS);

  const heading = page.locator('h1').first();
  await expect(heading, 'Artist display name (h1) missing').toBeVisible({
    timeout: 5_000,
  });
  const headingText = (await heading.textContent())?.trim() ?? '';
  expect(headingText.length, 'Artist display name is empty').toBeGreaterThan(0);

  const dspLink = page
    .locator(
      [
        'a[href*="spotify"]',
        'a[href*="apple"]',
        'a[href*="music"]',
        'a[href*="youtube"]',
        'button:has-text("Spotify")',
        'button:has-text("Apple Music")',
      ].join(', ')
    )
    .first();
  await expect(dspLink, 'No DSP link visible on public profile').toBeVisible({
    timeout: 5_000,
  });

  const actionAffordance = page
    .locator(
      [
        'a[href*="/tip"]',
        'a[href*="/subscribe"]',
        'a[href*="/tour"]',
        'a[href*="/contact"]',
        'button:has-text("Tip")',
        'button:has-text("Follow")',
        'button:has-text("Subscribe")',
        'button:has-text("Listen")',
        '[data-mode]',
      ].join(', ')
    )
    .first();
  await expect(
    actionAffordance,
    'No tip/contact/listen-mode affordance visible on public profile'
  ).toBeVisible({ timeout: 5_000 });

  await page.screenshot({
    path: `test-results/public-profile-smoke-${PROFILE_HANDLE}.png`,
    fullPage: true,
  });
});
