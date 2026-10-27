import { expect, Locator, Page, test } from '@playwright/test';
import {
  ClerkTestError,
  hasClerkCredentials,
  signInUser,
} from '../helpers/auth';

/**
 * Timeout constants for E2E tests.
 * Turbopack dev mode has slow cold compilation, so we use generous timeouts.
 */
const TIMEOUTS = {
  TEST_OVERALL: 180_000, // 3 min for slow dev mode (auth + Turbopack cold compile)
  NAVIGATION: 90_000, // Turbopack cold compilation
  MATRIX_VISIBLE: 15_000,
  ELEMENT_CHECK: 10_000,
  QUICK_CHECK: 5_000,
  SIDEBAR_OPEN: 30_000,
} as const;

const RELEASES_ROUTE = '/app/releases';

type ReleasesSurface = 'desktop' | 'mobile';

async function resolveReleasesSurface(
  page: Page
): Promise<ReleasesSurface | null> {
  const mobileRows = page.locator('[data-testid^="mobile-release-row-"]');
  if (
    await mobileRows
      .first()
      .isVisible({ timeout: TIMEOUTS.QUICK_CHECK })
      .catch(() => false)
  ) {
    return 'mobile';
  }

  const desktopRows = page.locator('tbody tr, [data-shell-release-row]');
  if (
    await desktopRows
      .first()
      .isVisible({ timeout: TIMEOUTS.QUICK_CHECK })
      .catch(() => false)
  ) {
    return 'desktop';
  }

  return null;
}

async function getFirstReleaseTrigger(
  page: Page,
  surface: ReleasesSurface
): Promise<Locator> {
  if (surface === 'mobile') {
    return page.locator('[data-testid^="mobile-release-row-"]').first();
  }

  const getDesktopOpenButton = (scope: Locator) =>
    scope.locator('[data-testid^="release-open-"]').first();

  const taggedRow = page.getByTestId('release-row').first();
  if ((await taggedRow.count()) > 0) {
    const openButton = getDesktopOpenButton(taggedRow);
    if ((await openButton.count()) > 0) {
      return openButton;
    }
    const firstCell = taggedRow.locator('td').first();
    if ((await firstCell.count()) > 0) {
      return firstCell;
    }
    return taggedRow;
  }

  const shellRow = page.locator('[data-shell-release-row]').first();
  if ((await shellRow.count()) > 0) {
    return shellRow;
  }

  const firstRow = page.locator('tbody tr').first();
  const openButton = getDesktopOpenButton(firstRow);
  if ((await openButton.count()) > 0) {
    return openButton;
  }

  const firstCell = firstRow.locator('td').first();
  if ((await firstCell.count()) > 0) {
    return firstCell;
  }

  return firstRow;
}

async function waitForReleaseSidebar(page: Page) {
  await expect(
    page
      .locator(
        '[data-testid="drawer-loading-skeleton"], [data-testid="release-sidebar"]'
      )
      .first()
  ).toBeVisible({ timeout: TIMEOUTS.SIDEBAR_OPEN });

  const sidebar = page.getByTestId('release-sidebar');
  await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.SIDEBAR_OPEN });
  return sidebar;
}

async function installClipboardSpy(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __releasesClipboard: string }).__releasesClipboard =
      '';
    navigator.clipboard.writeText = async (text: string) => {
      (
        window as unknown as { __releasesClipboard: string }
      ).__releasesClipboard = text;
      return Promise.resolve();
    };
  });
}

async function readClipboardSpy(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __releasesClipboard: string }).__releasesClipboard
  );
}

async function getSidebarSmartLinkUrl(sidebar: Locator) {
  const smartLinkToken = sidebar
    .locator('[title^="http://"], [title^="https://"]')
    .first();
  await expect(smartLinkToken).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });

  const url = await smartLinkToken.getAttribute('title');
  expect(url, 'Expected release sidebar smart link URL').toBeTruthy();
  return url!;
}

function extractSmartLinkHandle(url: string) {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return segments[0] ?? '';
}

/**
 * Pre-check helper for releases tests.
 * Waits for page to load and fails explicitly when the seeded creator route is not populated.
 */
async function ensureReleasesVisible(
  page: Page
): Promise<{ matrix: Locator; surface: ReleasesSurface }> {
  await page.waitForLoadState('load').catch(() => {});

  const matrix = page.getByTestId('releases-matrix');
  await expect(matrix).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });

  const surface = await resolveReleasesSurface(page);
  if (surface) {
    return { matrix, surface };
  }

  const knownFallbackStates = [
    ['disconnected', page.getByTestId('releases-empty-state-disconnected')],
    ['connected-empty', page.getByText('No releases yet')],
    ['importing', page.getByTestId('spotify-import-progress-banner')],
    ['failed', page.getByTestId('releases-empty-state-failed')],
    ['partial', page.getByTestId('releases-empty-state-partial')],
  ] as const;

  const visibleStates: string[] = [];
  for (const [state, locator] of knownFallbackStates) {
    if (
      await locator
        .isVisible({ timeout: TIMEOUTS.QUICK_CHECK })
        .catch(() => false)
    ) {
      visibleStates.push(state);
    }
  }

  expect(
    visibleStates,
    `Expected populated seeded releases on ${RELEASES_ROUTE}, found ${visibleStates.join(', ') || 'no rows'}`
  ).toHaveLength(0);

  return { matrix, surface: 'desktop' };
}

async function openFirstReleaseSidebar(page: Page) {
  const { surface } = await ensureReleasesVisible(page);
  const firstReleaseTrigger = await getFirstReleaseTrigger(page, surface);
  await firstReleaseTrigger.waitFor({
    state: 'visible',
    timeout: TIMEOUTS.ELEMENT_CHECK,
  });
  await firstReleaseTrigger.click();
  return waitForReleaseSidebar(page);
}

test.describe('Releases dashboard', () => {
  // Skip entire suite if Clerk auth fails during beforeEach
  test.beforeEach(async ({ page }, testInfo) => {
    const usingBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

    if (!hasClerkCredentials()) {
      testInfo.skip();
      return;
    }

    // Skip if Clerk setup wasn't successful (no real Clerk keys)
    if (!usingBypass && process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      console.warn(
        `⚠ Skipping ${testInfo.title}: Clerk testing setup was not successful`
      );
      testInfo.skip();
      return;
    }

    try {
      await signInUser(page);
    } catch (error) {
      // Skip test if Clerk fails to load (e.g., CDN issues or setup issues)
      if (
        error instanceof ClerkTestError &&
        (error.code === 'CLERK_NOT_READY' ||
          error.code === 'CLERK_SETUP_FAILED')
      ) {
        console.warn(`⚠ Skipping ${testInfo.title}: ${error.message}`);
        testInfo.skip();
        return;
      }

      // Handle Webkit navigation race: signInUser's page.goto can be interrupted
      // by a client-side redirect (e.g., Clerk redirecting to /app after sign-in)
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('Navigation interrupted') ||
        msg.includes('net::ERR_') ||
        msg.includes('Timeout') ||
        msg.includes('page.goto')
      ) {
        console.warn(
          `⚠ Skipping ${testInfo.title}: Navigation interrupted during sign-in (${msg.slice(0, 100)})`
        );
        testInfo.skip();
        return;
      }
      throw error;
    }
  });

  test('copies a smart link and follows the redirect @smoke', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.TEST_OVERALL);
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto(RELEASES_ROUTE, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await installClipboardSpy(page);

    const sidebar = await openFirstReleaseSidebar(page);
    await expect(sidebar.getByTestId('drawer-tab-dsps')).toBeVisible();
    await expect(sidebar.getByTestId('drawer-tab-tasks')).toBeVisible();
    await sidebar.getByTestId('drawer-tab-dsps').click();
    await expect(sidebar.getByTestId('drawer-tab-dsps')).toHaveAttribute(
      'aria-selected',
      'true'
    );

    const copiedUrl = await getSidebarSmartLinkUrl(sidebar);
    const smartLinkHandle = extractSmartLinkHandle(copiedUrl);
    expect(smartLinkHandle).toBeTruthy();
    expect(copiedUrl).toContain(`/${smartLinkHandle}/`);

    await sidebar.getByTitle('Copy smart link').click();
    await expect
      .poll(async () => readClipboardSpy(page), {
        timeout: TIMEOUTS.ELEMENT_CHECK,
      })
      .toBe(copiedUrl);

    await sidebar.getByTestId('drawer-tab-tasks').click();
    await expect(sidebar.getByTestId('release-tasks-card')).toBeVisible();
    await expect(
      sidebar.locator(
        '[data-testid="release-task-checklist-scroll-region"], [data-testid="release-task-empty-state-compact"]'
      )
    ).toBeVisible();
    await sidebar.getByTestId('drawer-tab-dsps').click();

    const smartLinkPage = await page.context().newPage();
    try {
      // The copied URL always carries the canonical public host (never a
      // loopback), so follow its path on the server under test.
      const smartLinkPath = new URL(copiedUrl!).pathname;
      const response = await smartLinkPage.goto(smartLinkPath, {
        waitUntil: 'domcontentloaded',
        timeout: 180_000,
      });
      expect(response?.status() ?? 500).toBeLessThan(400);
      expect(smartLinkPage.url()).toMatch(/^https?:\/\//);
    } finally {
      await smartLinkPage.close();
    }
  });

  test('shows releases matrix with basic columns @smoke', async ({ page }) => {
    test.setTimeout(TIMEOUTS.TEST_OVERALL);
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto(RELEASES_ROUTE, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const { surface } = await ensureReleasesVisible(page);

    if (surface === 'desktop') {
      await expect(page.getByRole('heading', { name: 'Releases' })).toBeVisible(
        {
          timeout: TIMEOUTS.ELEMENT_CHECK,
        }
      );
      // /app/releases aliases the shell catalog. Tracks/Releases tabs belong
      // to the retired matrix switcher; the canonical surface is this listbox.
      const releaseList = page.getByRole('listbox', { name: 'Releases' });
      await expect(releaseList).toBeVisible({
        timeout: TIMEOUTS.ELEMENT_CHECK,
      });
      await expect(
        releaseList.locator('[data-shell-release-row]').first()
      ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
    } else {
      await expect(page.getByTestId('mobile-release-list')).toBeVisible({
        timeout: TIMEOUTS.ELEMENT_CHECK,
      });
    }

    const releaseRows =
      surface === 'mobile'
        ? page.locator('[data-testid^="mobile-release-row-"]')
        : page.locator('tbody tr, [data-shell-release-row]');
    const rowCount = await releaseRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('opens edit sidebar when clicking a release row @nightly', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.TEST_OVERALL);
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto(RELEASES_ROUTE, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const sidebar = await openFirstReleaseSidebar(page);
    await expect(sidebar.getByTestId('release-properties-card')).toBeVisible();
    await expect(sidebar.getByTestId('release-tabbed-card')).toBeVisible();
    await expect(sidebar.getByTestId('drawer-tab-dsps')).toBeVisible();
    await sidebar.getByTestId('drawer-tab-dsps').click();
    await expect(sidebar.getByTitle('Copy smart link')).toBeVisible();
    await sidebar.getByTestId('drawer-tab-tasks').click();
    await expect(sidebar.getByTestId('release-tasks-card')).toBeVisible();
    await expect(
      sidebar.locator(
        '[data-testid="release-task-checklist-scroll-region"], [data-testid="release-task-empty-state-compact"]'
      )
    ).toBeVisible();
  });

  test('smart link URLs contain the correct artist handle @nightly', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.TEST_OVERALL);
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto(RELEASES_ROUTE, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const sidebar = await openFirstReleaseSidebar(page);
    const copiedUrl = await getSidebarSmartLinkUrl(sidebar);
    const smartLinkHandle = extractSmartLinkHandle(copiedUrl);
    expect(smartLinkHandle).toBeTruthy();

    await sidebar.getByTestId('drawer-tab-dsps').click();
    const smartLinkTokens = sidebar.locator(
      '[title^="http://"], [title^="https://"]'
    );
    const count = await smartLinkTokens.count();
    expect(count).toBeGreaterThan(0);

    // Check that each smart link URL contains the artist handle
    for (let i = 0; i < count; i++) {
      const url = await smartLinkTokens.nth(i).getAttribute('title');
      expect(url).toContain(`/${smartLinkHandle}/`);
    }
  });

  test('shows release list controls when releases exist @nightly', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.TEST_OVERALL);
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto(RELEASES_ROUTE, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const { surface } = await ensureReleasesVisible(page);
    expect(surface).toBe('desktop');

    // /app/releases renders the shell release list (ShellReleasesView, via
    // the library alias since #22071). Each row owns its smart link and
    // action menu; the table-era toolbar (export, preview toggle) is gone.
    const releaseList = page.getByRole('listbox', { name: 'Releases' });
    await expect(releaseList).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
    const rows = releaseList.getByRole('option');
    await expect
      .poll(() => rows.count(), { timeout: TIMEOUTS.ELEMENT_CHECK })
      .toBeGreaterThan(0);

    const firstRow = rows.first();
    await expect(
      firstRow.getByRole('link', { name: /^Open smart link for / })
    ).toHaveAttribute('href', /^\/[^/]+\/[^/]+/);
    await expect(
      firstRow.getByRole('button', { name: /^Release actions for / })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create a new release' })
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
  });

  test('opens the add-release calendar from the release list @nightly', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.TEST_OVERALL);
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto(RELEASES_ROUTE, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const { surface } = await ensureReleasesVisible(page);
    expect(surface).toBe('desktop');

    const addReleaseButton = page.getByRole('button', {
      name: 'Create a new release',
    });
    await expect(addReleaseButton).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_CHECK,
    });
    await addReleaseButton.click();
    // With Spotify connected, New release offers "Sync from Spotify" or
    // "Add manually"; the calendar lives in the manual form.
    await page.getByRole('menuitem', { name: 'Add manually' }).click();

    const addReleaseSidebar = page.getByTestId('add-release-sidebar');
    await expect(addReleaseSidebar).toBeVisible({
      timeout: TIMEOUTS.SIDEBAR_OPEN,
    });
    await expect(
      addReleaseSidebar.getByTestId('add-release-details-card')
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });

    await addReleaseSidebar
      .getByRole('button', { name: 'Release Date', exact: true })
      .click();
    await expect(
      addReleaseSidebar.locator('[role="grid"]').first()
    ).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_CHECK,
    });
  });
});
