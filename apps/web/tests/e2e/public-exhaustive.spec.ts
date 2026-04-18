import { expect, test } from './setup';
import {
  assertPublicSurfaceHealthy,
  installPublicRouteMocks,
  runDeclaredPublicInteractions,
  waitForPublicSurfaceReady,
} from './utils/public-surface-helpers';
import { resolvePublicSurfaceManifest } from './utils/public-surface-manifest';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
} from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

function createEmptyStorageState() {
  return { cookies: [], origins: [] } as const;
}

function getSurfaceFilter() {
  const raw = process.env.PUBLIC_SURFACE_FILTER?.trim();
  if (!raw) {
    return null;
  }

  return new Set(
    raw
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
  );
}

function sameOriginFailuresForPath(
  baseUrl: string,
  currentPath: string,
  surface: {
    expectedState: 'ok' | 'redirect' | 'not-found';
    allowedFinalDocumentStatuses?: readonly number[];
  },
  failures: readonly { url: string; status: number; statusText: string }[]
) {
  const origin = new URL(baseUrl).origin;
  const currentPathname = currentPath.split('?')[0];

  return failures.filter(failure => {
    if (!failure.url.startsWith(origin)) {
      return false;
    }

    const failureUrl = new URL(failure.url);
    if (
      surface.expectedState === 'not-found' &&
      failure.status === 404 &&
      failureUrl.pathname === currentPathname
    ) {
      return false;
    }

    if (
      surface.allowedFinalDocumentStatuses?.includes(failure.status) &&
      failureUrl.pathname === currentPathname
    ) {
      return false;
    }

    return true;
  });
}

function filterCriticalConsoleErrorsForSurface(
  surface: {
    expectedState?: 'ok' | 'redirect' | 'not-found';
    allowedFinalDocumentStatuses?: readonly number[];
  },
  errors: readonly string[]
) {
  return errors.filter(error => {
    const normalized = error.toLowerCase();
    const isExpectedClerkFetchNoise =
      normalized.includes('typeerror: failed to fetch') &&
      normalized.includes('clerk.browser.js');

    if (isExpectedClerkFetchNoise) {
      return false;
    }

    if (
      surface.allowedFinalDocumentStatuses?.includes(404) &&
      normalized.includes('failed to load resource') &&
      normalized.includes('404')
    ) {
      return false;
    }

    if (
      surface.allowedFinalDocumentStatuses?.includes(404) &&
      normalized.includes('typeerror: failed to fetch')
    ) {
      return false;
    }

    return true;
  });
}

function filterUncaughtExceptionsForSurface(
  surface: {
    expectedState?: 'ok' | 'redirect' | 'not-found';
    allowedFinalDocumentStatuses?: readonly number[];
  },
  exceptions: readonly string[]
) {
  return exceptions.filter(exception => {
    const normalized = exception.toLowerCase();
    const isExpectedNotFoundBoundaryNoise =
      (surface.expectedState === 'not-found' ||
        surface.allowedFinalDocumentStatuses?.includes(404)) &&
      normalized.includes('minified react error #419');

    if (isExpectedNotFoundBoundaryNoise) {
      return false;
    }

    return true;
  });
}

async function assertKeyboardReachability(
  page: import('@playwright/test').Page,
  surface: {
    expectedState: 'ok' | 'redirect' | 'not-found';
  }
) {
  const seenLabels = new Set<string>();

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    const descriptor = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return '';
      return (
        active.getAttribute('aria-label') ||
        active.textContent ||
        active.tagName
      );
    });
    if (descriptor) {
      seenLabels.add(descriptor.trim());
    }
  }

  expect(
    seenLabels.size,
    'Expected keyboard traversal to reach interactive controls'
  ).toBeGreaterThan(surface.expectedState === 'ok' ? 1 : 0);
}

async function assertNoClippedInteractiveElements(
  page: import('@playwright/test').Page
) {
  const horizontalOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(
    Math.max(horizontalOverflow.documentWidth, horizontalOverflow.bodyWidth),
    'Page introduces horizontal overflow beyond the viewport'
  ).toBeLessThanOrEqual(horizontalOverflow.viewportWidth + 12);
}

test.describe('Public Exhaustive Surface QA', () => {
  test.setTimeout(240_000);

  test('all public anonymous routes stay green under interaction sweep', async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(
      !['chromium', 'mobile-chrome'].includes(testInfo.project.name),
      'Public exhaustive lane only runs on chromium and mobile-chrome'
    );

    const resolvedBaseUrl = baseURL ?? 'http://127.0.0.1:3100';
    const filter = getSurfaceFilter();
    const surfaces = (await resolvePublicSurfaceManifest()).filter(surface =>
      filter ? filter.has(surface.id) : true
    );

    for (const surface of surfaces) {
      const surfaceContext = await browser.newContext({
        ...testInfo.project.use,
        storageState: createEmptyStorageState(),
      });
      const surfacePage = await surfaceContext.newPage();
      await installPublicRouteMocks(surfacePage);
      const monitoring = setupPageMonitoring(surfacePage);

      try {
        await test.step(`${surface.id} ${surface.resolvedPath}`, async () => {
          await surfacePage.goto(surface.resolvedPath, {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          await waitForPublicSurfaceReady(surfacePage, surface);
          await assertPublicSurfaceHealthy(surfacePage, surface);
          await runDeclaredPublicInteractions(
            surfacePage,
            surface,
            testInfo.project.name
          );
          await assertKeyboardReachability(surfacePage, surface);
          await assertNoClippedInteractiveElements(surfacePage);

          const diagnostics = monitoring.getContext();
          const currentPath =
            new URL(surfacePage.url()).pathname +
            new URL(surfacePage.url()).search;
          const sameOriginFailures = sameOriginFailuresForPath(
            resolvedBaseUrl,
            currentPath,
            surface,
            diagnostics.networkDiagnostics.failedResponses
          );

          expect(
            sameOriginFailures,
            `${surface.id} triggered same-origin failures: ${sameOriginFailures
              .map(
                failure =>
                  `${failure.status} ${failure.statusText} ${failure.url}`
              )
              .join('\n')}`
          ).toHaveLength(0);

          await assertNoCriticalErrors(
            {
              ...diagnostics,
              criticalErrors: filterCriticalConsoleErrorsForSurface(
                surface,
                diagnostics.criticalErrors
              ),
              uncaughtExceptions: filterUncaughtExceptionsForSurface(
                surface,
                diagnostics.uncaughtExceptions
              ),
            },
            testInfo
          );
        });
      } finally {
        monitoring.cleanup();
        await surfacePage.close().catch(() => undefined);
        await surfaceContext.close().catch(() => undefined);
      }
    }
  });
});
