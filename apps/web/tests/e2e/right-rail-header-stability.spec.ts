import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { inspectShellMaterial } from './utils/shell-material-detector';

const RELEASES_URL = '/app/releases';
const AUDIENCE_URL = '/app/audience';
const LAYOUT_TOLERANCE_PX = 1;
const DEV_SERVER_NAVIGATION_ATTEMPT_TIMEOUT_MS = 60_000;
const USE_TEST_AUTH_BYPASS = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

test.beforeAll(() => {
  if (!USE_TEST_AUTH_BYPASS) {
    throw new Error(
      'Right-rail stability spec requires E2E_USE_TEST_AUTH_BYPASS=1'
    );
  }
});

interface LayoutRect {
  readonly top: number;
  readonly height: number;
}

async function readRect(locator: Locator): Promise<LayoutRect> {
  await expect(locator).toBeVisible({ timeout: 15_000 });

  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      height: rect.height,
    };
  });
}

async function waitForRowsOrSkip(
  {
    rows,
    label,
  }: {
    readonly rows: Locator;
    readonly label: string;
  },
  testInfo: TestInfo
) {
  await rows
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => undefined);

  const rowCount = await rows.count();
  testInfo.skip(rowCount < 2, `${label} requires at least two rows`);
}

async function waitForReleaseSurface(page: Page) {
  const visibleSurface = page
    .getByTestId('shell-releases-view')
    .or(page.getByTestId('releases-matrix'))
    .first();

  const shellReady = page.getByTestId('releases-shell-ready');

  await Promise.race([
    visibleSurface
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => undefined),
    shellReady
      .waitFor({ state: 'attached', timeout: 30_000 })
      .catch(() => undefined),
  ]);
}

async function gotoWithDevServerRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, {
        timeout: DEV_SERVER_NAVIGATION_ATTEMPT_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTransientDevServerRestart =
        /ERR_EMPTY_RESPONSE|ECONNRESET|aborted|page\.goto: Timeout/i.test(
          message
        );

      if (!isTransientDevServerRestart || attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(2000);
    }
  }
}

function expectStableRect(
  before: LayoutRect,
  after: LayoutRect,
  label: string
) {
  expect(
    Math.abs(after.height - before.height),
    `${label} height shifted from ${before.height}px to ${after.height}px`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(
    Math.abs(after.top - before.top),
    `${label} top shifted from ${before.top}px to ${after.top}px`
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
}

async function measureRightRail({
  header,
  body,
}: {
  readonly header: Locator;
  readonly body: Locator;
}) {
  return {
    header: await readRect(header),
    body: await readRect(body),
  };
}

function expectNoRightRailShift({
  before,
  after,
}: {
  readonly before: Awaited<ReturnType<typeof measureRightRail>>;
  readonly after: Awaited<ReturnType<typeof measureRightRail>>;
}) {
  expectStableRect(before.header, after.header, 'Right rail header');
  expectStableRect(before.body, after.body, 'First body card');
}

function expectNoConsoleErrors(consoleErrors: string[]) {
  const ignorable = [/clerk|handshake|dev-browser/i, /sentry/i, /favicon/i];
  const relevant = consoleErrors.filter(e => !ignorable.some(rx => rx.test(e)));

  expect(
    relevant,
    `Unexpected console errors during right-rail stability check: ${relevant.join('\n')}`
  ).toEqual([]);
}

test('release right rail header stays fixed during keyboard selection changes', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);

  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));

  await gotoWithDevServerRetry(page, RELEASES_URL);
  await page.waitForURL(/\/app\/(?:dashboard\/)?releases/, {
    timeout: 60_000,
  });
  await waitForReleaseSurface(page);

  const rows = page.locator(
    '[data-shell-release-row], [data-testid="release-row"]'
  );
  await waitForRowsOrSkip(
    { rows, label: 'Release header stability check' },
    testInfo
  );

  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('release-sidebar')).toBeVisible({
    timeout: 15_000,
  });

  const before = await measureRightRail({
    header: page.getByTestId('release-header-card'),
    body: page.getByTestId('release-tabbed-card'),
  });

  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true', {
    timeout: 5_000,
  });

  const after = await measureRightRail({
    header: page.getByTestId('release-header-card'),
    body: page.getByTestId('release-tabbed-card'),
  });

  expectNoRightRailShift({ before, after });
  expectNoConsoleErrors(consoleErrors);
});

test('audience right rail header stays fixed when a contact has sparse data', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);

  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));

  await gotoWithDevServerRetry(page, AUDIENCE_URL);
  await page.waitForURL(/\/app\/(?:dashboard\/)?audience/, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('dashboard-audience-table')).toBeVisible({
    timeout: 30_000,
  });

  const rows = page.locator('tbody tr[data-index]');
  await waitForRowsOrSkip(
    { rows, label: 'Audience header stability check' },
    testInfo
  );

  await rows.nth(0).click();
  await expect(page.getByTestId('audience-member-sidebar')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('audience-member-header-card')).toBeVisible();

  const before = await measureRightRail({
    header: page.getByTestId('audience-member-header-card'),
    body: page.getByTestId('audience-member-tabbed-card'),
  });

  await rows.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused({ timeout: 5_000 });

  const after = await measureRightRail({
    header: page.getByTestId('audience-member-header-card'),
    body: page.getByTestId('audience-member-tabbed-card'),
  });

  expectNoRightRailShift({ before, after });
  expectNoConsoleErrors(consoleErrors);
});

const CONTACTS_AUDIENCE_URL = '/app/contacts?tab=audience';
const CONTACTS_AUDIENCE_ANALYTICS_URL =
  '/app/contacts?tab=audience&panel=analytics';
const PRESENCE_URL = '/app/presence';
const REPRODUCED_VIEWPORT = { width: 1512, height: 949 };

async function waitForAudienceTable(page: Page) {
  await expect(page.getByTestId('dashboard-audience-table')).toBeVisible({
    timeout: 30_000,
  });
}

function analyticsSidebar(page: Page) {
  return page.getByTestId('analytics-sidebar');
}

function analyticsToggle(page: Page) {
  return page.getByRole('button', {
    name: /analytics panel/i,
  });
}

// JOV-5836 deliberate-red fixture: neither a direct route load nor a
// Presence -> Contacts navigation may implicitly open the analytics panel.
// These assertions fail on builds that eagerly open the panel on mount.
test.describe('audience analytics panel is decoupled from navigation @jov-5836', () => {
  test.use({ viewport: REPRODUCED_VIEWPORT });
  test.beforeEach(async ({ page }) => {
    // The default creator fixture can still be in onboarding; use the same
    // ready creator as the composed shell certification, without real accounts.
    await page.goto(
      '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app'
    );
    await expect(page.locator('[data-app-shell-frame]')).toBeVisible();
  });

  test('direct load of the audience tab opens no secondary panel', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);

    const consoleErrors: string[] = [];
    page.on('pageerror', err => consoleErrors.push(String(err)));

    await gotoWithDevServerRetry(page, CONTACTS_AUDIENCE_URL);
    await page.waitForURL(/\/app\/(?:dashboard\/)?contacts/, {
      timeout: 60_000,
    });
    await waitForAudienceTable(page);

    await expect(analyticsSidebar(page)).toBeHidden();
    await expect(analyticsToggle(page)).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(new URL(page.url()).searchParams.get('panel')).toBeNull();
    const material = await inspectShellMaterial(page);
    await testInfo.attach('audience-closed-material', {
      body: JSON.stringify(material),
      contentType: 'application/json',
    });
    expect(material.plane).not.toBeNull();
    expect(material.findings).toEqual([]);
    await testInfo.attach('contacts-audience-direct-load', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    expectNoConsoleErrors(consoleErrors);
  });

  test('presence -> audience navigation opens no secondary panel', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);

    const consoleErrors: string[] = [];
    page.on('pageerror', err => consoleErrors.push(String(err)));

    await gotoWithDevServerRetry(page, PRESENCE_URL);
    await page.waitForURL(/\/app\/(?:dashboard\/)?presence/, {
      timeout: 60_000,
    });

    // Current shell IA exposes Audience as the root; Contacts is contextual.
    await page.getByRole('link', { name: 'Audience', exact: true }).click();
    await page.waitForURL(/\/app\/(?:dashboard\/)?contacts/, {
      timeout: 60_000,
    });

    await waitForAudienceTable(page);

    await expect(analyticsSidebar(page)).toBeHidden();
    expect(new URL(page.url()).searchParams.get('panel')).toBeNull();
    await testInfo.attach('presence-to-contacts-audience', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    expectNoConsoleErrors(consoleErrors);
  });

  test('explicit toggle opens the panel and keeps header geometry stable', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);

    const consoleErrors: string[] = [];
    page.on('pageerror', err => consoleErrors.push(String(err)));

    await gotoWithDevServerRetry(page, CONTACTS_AUDIENCE_URL);
    await waitForAudienceTable(page);

    const header = page.getByTestId('dashboard-header');
    const before = await readRect(header);

    await analyticsToggle(page).click();
    await expect(analyticsSidebar(page)).toBeVisible({ timeout: 15_000 });
    await expect(analyticsToggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.get('panel')).toBe('analytics');

    expectStableRect(before, await readRect(header), 'Dashboard header');
    const material = await inspectShellMaterial(page);
    await testInfo.attach('audience-open-material', {
      body: JSON.stringify(material),
      contentType: 'application/json',
    });
    expect(material.plane).not.toBeNull();
    expect(material.findings).toEqual([]);

    await analyticsToggle(page).click();
    await expect(analyticsSidebar(page)).toBeHidden({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get('panel')).toBeNull();

    expectStableRect(before, await readRect(header), 'Dashboard header');
    expectNoConsoleErrors(consoleErrors);
  });

  test('keyboard toggle works and back/forward restores panel state', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await gotoWithDevServerRetry(page, CONTACTS_AUDIENCE_URL);
    await waitForAudienceTable(page);

    const toggle = analyticsToggle(page);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(analyticsSidebar(page)).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.goBack();
    await expect(analyticsSidebar(page)).toBeHidden({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await page.goForward();
    await expect(analyticsSidebar(page)).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  // Legitimate deep link: a route that explicitly encodes the panel must open
  // it on load.
  test('panel=analytics deep link opens the analytics panel', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await gotoWithDevServerRetry(page, CONTACTS_AUDIENCE_ANALYTICS_URL);
    await waitForAudienceTable(page);

    await expect(analyticsSidebar(page)).toBeVisible({ timeout: 15_000 });
    await expect(analyticsToggle(page)).toHaveAttribute('aria-pressed', 'true');
  });
});
