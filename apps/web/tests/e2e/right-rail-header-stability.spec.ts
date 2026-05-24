import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';

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
