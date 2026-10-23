import { expect, test } from '@playwright/test';
import { DEMO_RELEASE_VIEW_MODELS } from '@/features/demo/mock-release-data';

/**
 * Demo Page QA Harness
 *
 * Deterministic e2e tests for /demo — the primary acceptance surface for
 * Linear-parity UI changes. Uses fixture data (no auth, no DB), so tests
 * are stable across environments.
 *
 * Run:
 *   doppler run -- pnpm exec playwright test demo-qa --config=playwright.config.noauth.ts --project=chromium --headed
 *
 * @smoke
 */

test.use({ storageState: { cookies: [], origins: [] } });

function getPrimaryReleaseTitle() {
  const primaryReleaseTitle = DEMO_RELEASE_VIEW_MODELS[0]?.title;

  expect(
    primaryReleaseTitle,
    'Expected at least one demo release fixture'
  ).toBeTruthy();

  return primaryReleaseTitle!;
}

test.describe('Demo page — structural QA', () => {
  test.beforeEach(async ({ page }) => {
    // Block analytics endpoints to prevent flaky network calls
    await page.route('**/api/track', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/profile/view', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
  });

  test('renders without errors and shows core structure', async ({ page }) => {
    test.setTimeout(90_000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/demo', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Page should not show server errors
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).not.toContain('application error');
    expect(bodyText.toLowerCase()).not.toContain('internal server error');

    // Sidebar navigation should be present. The canonical customer nav is
    // Inbox / Identity / Work / Audience links; Work is the demo's live root.
    const sidebarNav = page.locator('nav[aria-label="Dashboard Navigation"]');
    const workNav = sidebarNav.getByRole('link', { name: 'Work' });
    await expect(workNav).toBeVisible({ timeout: 30_000 });

    // No fatal console errors (filter out known noisy warnings)
    const fatalErrors = consoleErrors.filter(
      e =>
        !e.includes('hydration') &&
        !e.includes('Warning:') &&
        !e.includes('DevTools') &&
        !e.includes('401 (Unauthorized)')
    );
    expect(
      fatalErrors,
      `Unexpected console errors on /demo:\n${fatalErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('release table renders fixture data', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/demo', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Wait for the releases workspace (the demo's core content)
    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 30_000 });

    const primaryReleaseTitle = getPrimaryReleaseTitle();
    const firstReleaseRow = matrix.locator('[data-shell-release-row]').first();

    await expect(firstReleaseRow).toBeVisible({ timeout: 15_000 });
    await expect(firstReleaseRow.getByText(primaryReleaseTitle)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('release drawer opens from the shell release row', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/demo', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // /demo renders the same shell release list as /app/releases; the
    // production release drawer opens from the row itself.
    const firstReleaseRow = page.locator('[data-shell-release-row]').first();
    await expect(firstReleaseRow).toBeVisible({ timeout: 30_000 });
    await firstReleaseRow.click();

    await expect(page.getByTestId('release-sidebar')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('audience demo route renders analytics drawer without fatal errors', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/demo/audience', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.getByTestId('demo-analytics-sidebar')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: /analytics panel/i })
    ).toBeVisible();

    const fatalErrors = consoleErrors.filter(
      e =>
        !e.includes('hydration') &&
        !e.includes('Warning:') &&
        !e.includes('DevTools') &&
        !e.includes('401 (Unauthorized)')
    );
    expect(
      fatalErrors,
      `Unexpected console errors on /demo/audience:\n${fatalErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('sidebar navigation items are accessible', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/demo', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Core sidebar nav items should be present and keyboard-accessible.
    // The canonical customer nav renders Inbox / Identity / Work / Audience
    // links; Work is the only root with demo content.
    const sidebarNav = page.locator('nav[aria-label="Dashboard Navigation"]');
    const workNav = sidebarNav.getByRole('link', { name: 'Work' });
    await expect(workNav).toBeVisible({ timeout: 30_000 });

    // Check for other expected nav items in the demo shell
    const audienceNav = sidebarNav.getByRole('link', { name: 'Audience' });
    await expect(audienceNav).toBeVisible({ timeout: 10_000 });
  });
});
