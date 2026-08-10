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
 *  - At least one release/listen affordance is visible
 *  - At least one action affordance (support / contact / listen mode)
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
// Keep the latency assertion isolated from the status-semantics requests added
// below. With fullyParallel enabled globally, three simultaneous cold profile
// renders contend for the same standalone server and turn this browser budget
// into a worker-count benchmark rather than a visitor-load measurement.
test.describe.configure({ mode: 'serial' });

const PROFILE_HANDLE = process.env.SMOKE_PROFILE_HANDLE ?? 'timwhite';
const LOAD_BUDGET_MS = Number(process.env.SMOKE_LOAD_BUDGET_MS ?? '3000');
const hasDatabase = Boolean(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);

test('public profile renders core elements within budget', async ({ page }) => {
  test.setTimeout(60_000);

  // Listen mode surfaces music links; default mode often hides them behind a
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

  const releaseOrListenAffordances = page
    .locator(
      [
        'a[aria-label^="View "]',
        '[data-testid="profile-home-carousel"] a',
        'a[href*="spotify"]',
        'a[href*="apple"]',
        'a[href*="music"]',
        'a[href*="youtube"]',
        'button:has-text("Spotify")',
        'button:has-text("Apple Music")',
      ].join(', ')
    )
    .filter({ visible: true });
  await expect(
    releaseOrListenAffordances.first(),
    'No release or listen affordance visible on public profile'
  ).toBeVisible({ timeout: 5_000 });

  // System B redesign uses a bottom tab bar (Profile / Music / Events / Alerts)
  // and an inline alerts link (?mode=subscribe). Legacy affordance selectors are
  // kept for backward compat but most now render as <a> or aria-label buttons.
  const actionAffordances = page
    .locator(
      [
        'a[href*="mode=subscribe"]',
        'a[href*="/tip"]',
        'a[href*="/subscribe"]',
        'a[href*="/tour"]',
        'a[href*="/contact"]',
        'a[href*="/listen"]',
        'button:has-text("Tip")',
        'button:has-text("Follow")',
        'button:has-text("Subscribe")',
        'button:has-text("Support")',
        'button:has-text("Open support")',
        'button[aria-label="Home"]',
        'button[aria-label="Music"]',
        'button[aria-label="Events"]',
        'button[aria-label="Alerts"]',
        '[data-mode]',
        '[data-testid="profile-home-alerts-row"]',
        '[data-testid="profile-tab-bar"]',
      ].join(', ')
    )
    .filter({ visible: true });
  await expect(
    actionAffordances.first(),
    'No support/contact/listen-mode affordance visible on public profile'
  ).toBeVisible({ timeout: 5_000 });

  await page.screenshot({
    path: `test-results/public-profile-smoke-${PROFILE_HANDLE}.png`,
    fullPage: true,
  });
});

test.describe('public profile document semantics @regression', () => {
  test.skip(!hasDatabase, 'Profile document semantics require a real database');

  test('a seeded public profile remains a successful document', async ({
    page,
  }) => {
    const response = await page.goto('/dualipa', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Dua Lipa', level: 1 })
    ).toBeVisible();
    await expect(page.getByTestId('not-found')).toHaveCount(0);
  });

  test('a missing valid handle returns the branded profile 404', async ({
    page,
  }) => {
    const response = await page.goto('/nonexistent-artist', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Profile not found' })
    ).toBeVisible();
    await expect(page.getByTestId('not-found')).toBeVisible();
    const homeAction = page.getByRole('link', { name: 'Go home' });
    const searchAction = page.getByRole('link', { name: 'Search artists' });

    await expect(homeAction).toHaveAttribute('href', '/');
    await expect(searchAction).toHaveAttribute('href', '/artist-profiles');

    for (const action of [homeAction, searchAction]) {
      const box = await action.boundingBox();
      expect(
        box,
        'Missing-profile action has no rendered target'
      ).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await homeAction.focus();
    await expect(homeAction).toBeFocused();
    await searchAction.focus();
    await expect(searchAction).toBeFocused();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]')
    ).toHaveCount(1);
  });
});
