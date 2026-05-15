/**
 * E2E contract: authenticated app-shell route transitions preserve the shared
 * shell frame and keep shell-level network bursts bounded.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-route-persistence.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Page, type Request, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { resolveChatConversationPath } from './utils/dashboard-route-resolvers';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const DOCUMENT_LOAD_COUNTER_KEY = 'jovie:shell-route-persistence-load-count';
const PERSISTENCE_PROBE_VALUE = 'jov-2219-shell-frame';

const CORE_SHELL_REQUEST_BUDGETS = new Map<string, number>([
  ['/api/version', 6],
  ['/api/billing/status', 4],
  ['/api/chat/conversations', 6],
]);

const MAX_RSC_REQUESTS_DURING_SHELL_FLOW = 10;

type RequestBudgetSnapshot = Readonly<{
  abortedCoreRequests: readonly string[];
  coreRequestCounts: Record<string, number>;
  rscRequestCount: number;
}>;

function pathnameFromRequest(request: Request): string | null {
  try {
    return new URL(request.url()).pathname;
  } catch {
    return null;
  }
}

function isRscRequest(request: Request): boolean {
  try {
    const url = new URL(request.url());
    if (url.searchParams.has('_rsc')) return true;
  } catch {
    return false;
  }

  const headers = request.headers();
  return headers.rsc === '1' || headers.accept?.includes('text/x-component');
}

function attachRequestBudgetProbe(page: Page): {
  readonly snapshot: () => RequestBudgetSnapshot;
} {
  const coreRequestCounts = new Map<string, number>();
  const abortedCoreRequests: string[] = [];
  let rscRequestCount = 0;

  page.on('request', request => {
    const pathname = pathnameFromRequest(request);
    if (pathname && CORE_SHELL_REQUEST_BUDGETS.has(pathname)) {
      coreRequestCounts.set(
        pathname,
        (coreRequestCounts.get(pathname) ?? 0) + 1
      );
    }
    if (isRscRequest(request)) {
      rscRequestCount += 1;
    }
  });

  page.on('requestfailed', request => {
    const pathname = pathnameFromRequest(request);
    const failureText = request.failure()?.errorText ?? '';
    if (
      pathname &&
      CORE_SHELL_REQUEST_BUDGETS.has(pathname) &&
      /ERR_ABORTED|aborted/i.test(failureText)
    ) {
      abortedCoreRequests.push(
        `${request.method()} ${pathname}: ${failureText}`
      );
    }
  });

  return {
    snapshot: () => ({
      abortedCoreRequests,
      coreRequestCounts: Object.fromEntries(coreRequestCounts),
      rscRequestCount,
    }),
  };
}

async function forceDesignV1(page: Page): Promise<void> {
  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
  });

  await page.addInitScript(
    ({ cookieName, key, loadCounterKey, value }) => {
      const nextLoadCount =
        Number(sessionStorage.getItem(loadCounterKey) ?? '0') + 1;
      sessionStorage.setItem(loadCounterKey, String(nextLoadCount));
      localStorage.setItem(key, value);
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
      loadCounterKey: DOCUMENT_LOAD_COUNTER_KEY,
      value: overrides,
    }
  );
}

async function readDocumentLoadCount(page: Page): Promise<number> {
  return page.evaluate(
    key => Number(sessionStorage.getItem(key) ?? '0'),
    DOCUMENT_LOAD_COUNTER_KEY
  );
}

async function markPersistentShellFrame(page: Page): Promise<void> {
  const shellFrame = page.locator('[data-app-shell-frame="true"]');
  await expect(shellFrame).toBeVisible({ timeout: 30_000 });
  await shellFrame.evaluate((element, probeValue) => {
    element.setAttribute('data-persistence-probe', probeValue);
  }, PERSISTENCE_PROBE_VALUE);
}

async function assertPersistentShellFrame(
  page: Page,
  label: string
): Promise<void> {
  const shellFrame = page.locator(
    `[data-app-shell-frame="true"][data-persistence-probe="${PERSISTENCE_PROBE_VALUE}"]`
  );
  await expect(shellFrame, `${label}: shell frame stayed mounted`).toBeVisible({
    timeout: 30_000,
  });

  const shellScroll = page.locator('[data-testid="app-shell-scroll"]');
  await expect(shellScroll, `${label}: shell scroll area visible`).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        shellScroll.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const textLength = (element.textContent ?? '').trim().length;
          return rect.height > 240 && rect.width > 320 && textLength > 8;
        }),
      { message: `${label}: app content is not blank`, timeout: 30_000 }
    )
    .toBe(true);

  const box = await shellScroll.boundingBox();
  expect(box, `${label}: shell scroll box exists`).not.toBeNull();
  if (box) {
    expect(box.height, `${label}: shell scroll height`).toBeGreaterThan(240);
    expect(box.width, `${label}: shell scroll width`).toBeGreaterThan(320);
  }
}

async function expectRouteContent(
  page: Page,
  routeName: string
): Promise<void> {
  const selectorsByRoute = new Map<string, string>([
    ['chat', '[data-testid="chat-content"]'],
    [
      'releases',
      '[data-testid="releases-matrix"], [data-testid="shell-releases-view"]',
    ],
    ['library', '[data-testid="library-surface"]'],
    [
      'tasks',
      [
        '[data-testid="tasks-workspace"]',
        '[data-testid="tasks-board"]',
        '[data-testid="tasks-upgrade-interstitial"]',
      ].join(', '),
    ],
  ]);
  const selector = selectorsByRoute.get(routeName);
  if (!selector) return;

  await expect(page.locator(selector).first()).toBeVisible({ timeout: 45_000 });
}

async function resolveChatConversationPathWithRetry(
  page: Page
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await resolveChatConversationPath(page);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await page.waitForTimeout(1500 * attempt);
    }
  }

  throw lastError;
}

async function clickFirstVisibleAppLink(
  page: Page,
  hrefs: readonly string[],
  expectedPathnames: readonly string[]
): Promise<void> {
  const selector = hrefs.map(href => `a[href="${href}"]`).join(', ');
  const links = page.locator(selector);
  await expect(links.first()).toBeAttached({ timeout: 30_000 });

  const count = await links.count();
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    if (!(await link.isVisible().catch(() => false))) continue;

    await link.click({ noWaitAfter: true });
    await page.waitForURL(url => expectedPathnames.includes(url.pathname), {
      timeout: 60_000,
    });
    return;
  }

  throw new Error(`No visible app link found for ${hrefs.join(', ')}`);
}

async function assertNoDocumentReloadSince(
  page: Page,
  baselineLoadCount: number,
  label: string
): Promise<void> {
  const loadCount = await readDocumentLoadCount(page);
  expect(
    loadCount,
    `${label}: app-shell route transition stayed client-side`
  ).toBe(baselineLoadCount);
}

test('app shell persists across core app routes without duplicate request bursts', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.fail(
    true,
    'JOV-2219 Slice 0 captures the current app-shell remount across /app routes; remove this expected failure in the Foundation slice once the shell frame persists client-side.'
  );
  test.setTimeout(240_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-shell-persistence-user'
  );

  const requests = attachRequestBudgetProbe(page);

  await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });
  await expectRouteContent(page, 'chat');

  const chatThreadPath = await resolveChatConversationPathWithRetry(page);
  await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });
  await expectRouteContent(page, 'chat');

  await markPersistentShellFrame(page);
  const baselineLoadCount = await readDocumentLoadCount(page);

  await clickFirstVisibleAppLink(
    page,
    [APP_ROUTES.DASHBOARD_RELEASES, APP_ROUTES.RELEASES],
    [APP_ROUTES.DASHBOARD_RELEASES, APP_ROUTES.RELEASES]
  );
  await expectRouteContent(page, 'releases');
  await assertPersistentShellFrame(page, 'releases route');
  await assertNoDocumentReloadSince(page, baselineLoadCount, 'releases route');

  await clickFirstVisibleAppLink(
    page,
    [APP_ROUTES.LIBRARY],
    [APP_ROUTES.LIBRARY]
  );
  await expectRouteContent(page, 'library');
  await assertPersistentShellFrame(page, 'library route');
  await assertNoDocumentReloadSince(page, baselineLoadCount, 'library route');

  await clickFirstVisibleAppLink(page, [APP_ROUTES.TASKS], [APP_ROUTES.TASKS]);
  await expectRouteContent(page, 'tasks');
  await assertPersistentShellFrame(page, 'tasks route');
  await assertNoDocumentReloadSince(page, baselineLoadCount, 'tasks route');

  await clickFirstVisibleAppLink(page, [APP_ROUTES.CHAT], [APP_ROUTES.CHAT]);
  await expectRouteContent(page, 'chat');
  await assertPersistentShellFrame(page, 'chat route');
  await assertNoDocumentReloadSince(page, baselineLoadCount, 'chat route');

  await clickFirstVisibleAppLink(page, [chatThreadPath], [chatThreadPath]);
  await expect(page.locator('[data-testid="chat-content"]')).toBeVisible({
    timeout: 45_000,
  });
  await assertPersistentShellFrame(page, 'chat thread route');
  await assertNoDocumentReloadSince(
    page,
    baselineLoadCount,
    'chat thread route'
  );

  const snapshot = requests.snapshot();
  expect(snapshot.abortedCoreRequests).toEqual([]);
  expect(snapshot.rscRequestCount).toBeLessThanOrEqual(
    MAX_RSC_REQUESTS_DURING_SHELL_FLOW
  );

  for (const [pathname, maxCount] of CORE_SHELL_REQUEST_BUDGETS) {
    expect(snapshot.coreRequestCounts[pathname] ?? 0).toBeLessThanOrEqual(
      maxCount
    );
  }
});
