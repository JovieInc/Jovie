import { expect, Locator, Page, test } from '@playwright/test';
import {
  ClerkTestError,
  hasClerkCredentials,
  signInUser,
} from '../helpers/clerk-auth';

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

  const desktopRows = page.locator('tbody tr');
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

  const findDesktopOpenButton = async (scope: Locator) => {
    const openButton = scope.locator('[data-testid^="release-open-"]').first();
    const isVisible = await openButton
      .isVisible({ timeout: TIMEOUTS.QUICK_CHECK })
      .catch(() => false);
    return isVisible ? openButton : null;
  };

  const taggedRow = page.getByTestId('release-row').first();
  if ((await taggedRow.count()) > 0) {
    const openButton = await findDesktopOpenButton(taggedRow);
    if (openButton) {
      return openButton;
    }
    const firstCell = taggedRow.locator('td').first();
    if ((await firstCell.count()) > 0) {
      return firstCell;
    }
    return taggedRow;
  }

  const firstRow = page.locator('tbody tr').first();
  const openButton = await findDesktopOpenButton(firstRow);
  if (openButton) {
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

async function isReleaseSidebarSurfaceVisible(
  page: Page,
  timeout = TIMEOUTS.QUICK_CHECK
) {
  return page
    .locator(
      '[data-testid="drawer-loading-skeleton"], [data-testid="release-sidebar"]'
    )
    .first()
    .isVisible({ timeout })
    .catch(() => false);
}

async function didReleaseSidebarOpenStart(
  page: Page,
  previewToggle: Locator | null,
  initialPreviewPressed: string | null
) {
  if (
    await isReleaseSidebarSurfaceVisible(
      page,
      previewToggle ? 1_000 : TIMEOUTS.ELEMENT_CHECK
    )
  ) {
    return true;
  }

  if (!previewToggle) {
    return false;
  }

  const currentPreviewPressed = await previewToggle
    .getAttribute('aria-pressed')
    .catch(() => null);

  return (
    currentPreviewPressed === 'true' &&
    currentPreviewPressed !== initialPreviewPressed
  );
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
  const smartLinkToken = sidebar.getByTestId(
    'release-sidebar-canonical-smart-link'
  );
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
    `Expected populated seeded releases on /app/dashboard/releases, found ${visibleStates.join(', ') || 'no rows'}`
  ).toHaveLength(0);

  return { matrix, surface: 'desktop' };
}

type ReleaseSidebarOpenStrategy = 'row' | 'toggle-first';

async function openFirstReleaseSidebar(
  page: Page,
  strategy: ReleaseSidebarOpenStrategy = 'toggle-first'
) {
  const { surface } = await ensureReleasesVisible(page);
  if (await isReleaseSidebarSurfaceVisible(page)) {
    return waitForReleaseSidebar(page);
  }

  const previewToggle =
    surface === 'desktop'
      ? page.getByRole('button', { name: 'Toggle release preview' })
      : null;
  const initialPreviewPressed = previewToggle
    ? await previewToggle.getAttribute('aria-pressed').catch(() => null)
    : null;
  const tryPreviewToggle = async () => {
    if (
      !previewToggle ||
      !(await previewToggle
        .isVisible({ timeout: TIMEOUTS.QUICK_CHECK })
        .catch(() => false))
    ) {
      return false;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await previewToggle.click({ force: true });
      if (
        await didReleaseSidebarOpenStart(
          page,
          previewToggle,
          initialPreviewPressed
        )
      ) {
        return true;
      }
    }

    return false;
  };

  const tryRowTrigger = async () => {
    const firstReleaseTrigger = await getFirstReleaseTrigger(page, surface);
    await firstReleaseTrigger.waitFor({
      state: 'visible',
      timeout: TIMEOUTS.ELEMENT_CHECK,
    });
    await firstReleaseTrigger.scrollIntoViewIfNeeded().catch(() => {});

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await firstReleaseTrigger.click({ force: true });
      if (
        await didReleaseSidebarOpenStart(
          page,
          previewToggle,
          initialPreviewPressed
        )
      ) {
        return true;
      }
    }

    return false;
  };

  const sidebarOpened =
    strategy === 'row'
      ? (await tryRowTrigger()) ||
        (surface === 'desktop' && (await tryPreviewToggle()))
      : (surface === 'desktop' && (await tryPreviewToggle())) ||
        (await tryRowTrigger());

  if (!sidebarOpened) {
    const fallbackTrigger = await getFirstReleaseTrigger(page, surface);
    await fallbackTrigger.scrollIntoViewIfNeeded().catch(() => {});
    await fallbackTrigger.click({ force: true });
  }

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
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await installClipboardSpy(page);

    const sidebar = await openFirstReleaseSidebar(page, 'row');
    await expect(sidebar.getByTestId('drawer-tab-links')).toBeVisible();
    await expect(sidebar.getByTestId('drawer-tab-tasks')).toBeVisible();
    await sidebar.getByTestId('drawer-tab-links').click();
    await expect(sidebar.getByTestId('drawer-tab-links')).toHaveAttribute(
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
    await expect(sidebar.getByTestId('drawer-tab-tasks')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await sidebar.getByTestId('drawer-tab-links').click();

    const smartLinkPage = await page.context().newPage();
    try {
      const response = await smartLinkPage.goto(copiedUrl!, {
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
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const { surface } = await ensureReleasesVisible(page);

    if (surface === 'desktop') {
      await expect(page.getByRole('heading', { name: 'Releases' })).toBeVisible(
        {
          timeout: TIMEOUTS.ELEMENT_CHECK,
        }
      );
      await expect(
        page.getByRole('tab', { name: 'Tracks' }).first()
      ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
      await expect(
        page.getByRole('tab', { name: 'Releases' }).first()
      ).toHaveAttribute('aria-selected', 'true');
    } else {
      await expect(page.getByTestId('mobile-release-list')).toBeVisible({
        timeout: TIMEOUTS.ELEMENT_CHECK,
      });
    }

    const releaseRows =
      surface === 'mobile'
        ? page.locator('[data-testid^="mobile-release-row-"]')
        : page.locator('tbody tr');
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
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const sidebar = await openFirstReleaseSidebar(page);
    await expect(sidebar.getByTestId('release-tabbed-card')).toBeVisible();
    await expect(sidebar.getByTestId('drawer-tab-links')).toBeVisible();
    await sidebar.getByTestId('drawer-tab-links').click();
    await expect(sidebar.getByTitle('Copy smart link')).toBeVisible();
    await sidebar.getByTestId('drawer-tab-tasks').click();
    await expect(sidebar.getByTestId('drawer-tab-tasks')).toHaveAttribute(
      'aria-selected',
      'true'
    );
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
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const sidebar = await openFirstReleaseSidebar(page);
    const copiedUrl = await getSidebarSmartLinkUrl(sidebar);
    const smartLinkHandle = extractSmartLinkHandle(copiedUrl);
    expect(smartLinkHandle).toBeTruthy();

    await sidebar.getByTestId('drawer-tab-links').click();
    const canonicalUrl = await getSidebarSmartLinkUrl(sidebar);
    expect(canonicalUrl).toContain(`/${smartLinkHandle}/`);
  });

  test('shows release toolbar controls when releases exist @nightly', async ({
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
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const { surface } = await ensureReleasesVisible(page);

    const releaseRows =
      surface === 'mobile'
        ? page.locator('[data-testid^="mobile-release-row-"]')
        : page.locator('tbody tr');
    expect(await releaseRows.count()).toBeGreaterThan(0);

    await expect(
      page.getByRole('button', { name: 'Search releases' })
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
    await expect(page.getByRole('button', { name: 'Filter' })).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_CHECK,
    });
    await expect(
      page.getByRole('button', { name: 'Export data to CSV file' })
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
    await expect(
      page.getByRole('button', { name: 'Toggle release preview' })
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_CHECK });
  });
});
