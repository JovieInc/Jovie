import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  getTimWhiteDashboardReleaseSequence,
  getTimWhiteDemoReleaseById,
  TIM_WHITE_DEMO_MANIFEST,
} from '@/lib/tim-white-demo';
import {
  setTestAuthBypassSession,
  waitForAuthenticatedHealth,
} from '@/tests/helpers/clerk-auth';
import {
  getDemoReleasesForUserByTitles,
  getDemoUserHandle,
  interceptTrackingCalls,
} from './helpers/e2e-helpers';

const TASK_COUNT = DEFAULT_RELEASE_TASK_TEMPLATE.length;
const AUTO_TASK_COUNT = DEFAULT_RELEASE_TASK_TEMPLATE.filter(
  item => item.assigneeType === 'ai_workflow'
).length;
const FRAME_SETTLE_MS = 1_250;
const HOME_FRAME_SETTLE_MS = 2_100;
const FOUNDER_DISPLAY_NAME = TIM_WHITE_PROFILE.name;
const HOME_READY_TEXT =
  /Drop more music\. Crush every release\.|The link your music deserves\./;
const PUBLIC_PROFILE_READY_TEXT = new RegExp(TIM_WHITE_PROFILE.name);
const CLEANUP_SELECTORS = [
  '[data-testid="dev-toolbar"]',
  '[data-testid="cookie-banner"]',
  'button[aria-label="Show dev toolbar"]',
  '[aria-label="Open TanStack Query Devtools"]',
  '[data-next-badge-root]',
  '#nextjs-dev-tools-menu',
  'nextjs-portal',
];
const LOADING_SELECTORS = [
  '[data-testid*="loading"]',
  '[data-testid*="skeleton"]',
  '[aria-label^="Loading"]',
  '[class*="animate-spin"]',
  '[class*="animate-pulse"]',
];
const TRANSITION_VEIL_ID = 'demo-transition-veil';
const TRANSITION_STORAGE_KEY = 'demo-transition-visible';
const TRANSITION_FADE_MS = 140;
const NOTIFICATION_CONTACT_STORAGE_KEY = 'jovie:notification-contacts';
const NOTIFICATION_STATUS_CACHE_KEY = 'jovie:notification-status-cache';
const TOTAL_CLICKS_METRIC_TEST_ID = 'drawer-analytics-metric-total-clicks';
const TOTAL_CLICKS_METRIC_VALUE_TEST_ID =
  'drawer-analytics-metric-value-total-clicks';
const LAST_7_DAYS_METRIC_TEST_ID = 'drawer-analytics-metric-last-7-days-clicks';
const LAST_7_DAYS_METRIC_VALUE_TEST_ID =
  'drawer-analytics-metric-value-last-7-days-clicks';
const PROFILE_SKELETON_SELECTOR = 'output[aria-label="Loading Jovie profile"]';

interface DemoSceneReadyOptions {
  readonly readyLocator: Locator;
  readonly readyText?: RegExp | string;
  readonly forbiddenSelectors?: readonly string[];
}

function assertReleaseTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  if (!trimmed) {
    throw new Error('Seeded demo release is missing a title');
  }
  return trimmed;
}

async function configureRecordingContext(
  context: BrowserContext,
  cookieBaseUrl: string
) {
  await context.addInitScript(
    ({
      notificationContactStorageKey,
      notificationStatusCacheKey,
    }: {
      notificationContactStorageKey: string;
      notificationStatusCacheKey: string;
    }) => {
      localStorage.setItem('jv_cc', '1');
      localStorage.removeItem('__dev_toolbar_open');
      localStorage.removeItem('__dev_toolbar_hidden');
      localStorage.removeItem(notificationContactStorageKey);
      localStorage.removeItem(notificationStatusCacheKey);

      const isTransitionVisible = () => {
        try {
          return sessionStorage.getItem('demo-transition-visible') === '1';
        } catch {
          return false;
        }
      };

      const syncTransitionRoot = () => {
        document.documentElement.setAttribute(
          'data-demo-transition',
          isTransitionVisible() ? '1' : '0'
        );
      };

      const ensureTransitionStyle = () => {
        const styleId = 'demo-transition-style';
        const existing = document.getElementById(
          styleId
        ) as HTMLStyleElement | null;

        if (existing) {
          return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
        html {
          background: #080a10;
        }

        body {
          transition: opacity 140ms ease;
        }

        html[data-demo-transition="1"] body {
          opacity: 0 !important;
        }
      `;
        (document.head ?? document.documentElement).appendChild(style);
      };

      const ensureTransitionVeil = () => {
        const existing = document.getElementById(
          'demo-transition-veil'
        ) as HTMLDivElement | null;
        if (existing) {
          syncTransitionRoot();
          existing.style.opacity = isTransitionVisible() ? '1' : '0';
          existing.style.pointerEvents = isTransitionVisible()
            ? 'auto'
            : 'none';
          return;
        }

        const veil = document.createElement('div');
        veil.id = 'demo-transition-veil';
        Object.assign(veil.style, {
          position: 'fixed',
          inset: '0',
          background: 'rgba(8, 10, 16, 0.72)',
          opacity: isTransitionVisible() ? '1' : '0',
          pointerEvents: isTransitionVisible() ? 'auto' : 'none',
          transition: 'opacity 140ms ease',
          zIndex: '100000',
        });
        document.body.appendChild(veil);
      };

      ensureTransitionStyle();
      syncTransitionRoot();

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureTransitionVeil, {
          once: true,
        });
      } else {
        ensureTransitionVeil();
      }
    },
    {
      notificationContactStorageKey: NOTIFICATION_CONTACT_STORAGE_KEY,
      notificationStatusCacheKey: NOTIFICATION_STATUS_CACHE_KEY,
    }
  );

  await context.addCookies([
    {
      name: 'jv_cc',
      value: '1',
      url: cookieBaseUrl,
      sameSite: 'Lax',
    },
    {
      name: 'jv_cc_required',
      value: '0',
      url: cookieBaseUrl,
      sameSite: 'Lax',
    },
  ]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function authenticateDemoPage(page: Page, clerkUserId: string) {
  await setTestAuthBypassSession(page, null, clerkUserId);
  await waitForAuthenticatedHealth(page, clerkUserId);
}

async function clearDemoAuthCookies(
  context: BrowserContext,
  cookieBaseUrl: string
) {
  await context.clearCookies();
  await configureRecordingContext(context, cookieBaseUrl);
}

async function installCleanupStyle(page: Page) {
  await page.locator('body').waitFor({ state: 'attached', timeout: 30_000 });
  await page.evaluate(selectors => {
    const styleId = 'demo-cleanup-style';
    const existing = document.getElementById(
      styleId
    ) as HTMLStyleElement | null;

    if (!existing) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `${selectors.join(', ')} { display: none !important; visibility: hidden !important; }`;
      document.head.appendChild(style);
    }

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(node => {
        if (node instanceof HTMLElement) {
          node.style.display = 'none';
          node.style.visibility = 'hidden';
        }
      });
    }
  }, CLEANUP_SELECTORS);
}

async function setTransitionVeilVisible(page: Page, visible: boolean) {
  await page.evaluate(
    ({ storageKey, veilId, nextVisible }) => {
      try {
        sessionStorage.setItem(storageKey, nextVisible ? '1' : '0');
      } catch {}

      document.documentElement.setAttribute(
        'data-demo-transition',
        nextVisible ? '1' : '0'
      );

      const veil = document.getElementById(veilId) as HTMLDivElement | null;
      if (!veil) {
        return;
      }
      veil.style.opacity = nextVisible ? '1' : '0';
      veil.style.pointerEvents = nextVisible ? 'auto' : 'none';
    },
    {
      nextVisible: visible,
      storageKey: TRANSITION_STORAGE_KEY,
      veilId: TRANSITION_VEIL_ID,
    }
  );
}

async function injectCaptionOverlay(page: Page) {
  await installCleanupStyle(page);
  await page.evaluate(() => {
    if (document.getElementById('demo-caption')) return;

    const el = document.createElement('div');
    el.id = 'demo-caption';
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '56px',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(82vw, 760px)',
      padding: '12px 20px',
      background: 'rgba(0, 0, 0, 0.78)',
      color: '#fff',
      fontSize: '18px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontWeight: '600',
      textAlign: 'center',
      borderRadius: '14px',
      zIndex: '99999',
      transition: 'opacity 0.2s ease',
      opacity: '0',
      pointerEvents: 'none',
      backdropFilter: 'blur(8px)',
      letterSpacing: '-0.01em',
      boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
    });
    document.body.appendChild(el);
  });
}

async function setCaption(page: Page, text: string) {
  await page.evaluate(caption => {
    const el = document.getElementById('demo-caption');
    if (!el) return;
    el.textContent = caption;
    el.style.opacity = caption ? '1' : '0';
  }, text);
}

async function clearCaption(page: Page) {
  await setCaption(page, '');
}

async function waitForAnimationFrames(page: Page, count = 2) {
  await page.evaluate(async frameCount => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
    }
  }, count);
}

async function waitForSceneCleanup(
  page: Page,
  selectors: readonly string[] = LOADING_SELECTORS
) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count === 0) {
      continue;
    }
    await locator
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
  }
}

async function waitForReleaseAnalyticsRoute(page: Page, releaseId: string) {
  await expect
    .poll(
      async () => {
        return page.evaluate(
          async ({
            id,
            testAuthBypassMode,
            testModeCookie,
            testModeHeader,
            testUserIdCookie,
            testUserIdHeader,
          }) => {
            const readCookieValue = (cookieName: string) => {
              const cookie = document.cookie
                .split(';')
                .map(entry => entry.trim())
                .find(entry => entry.startsWith(`${cookieName}=`));
              if (!cookie) {
                return null;
              }

              return decodeURIComponent(cookie.slice(cookieName.length + 1));
            };

            const mode = readCookieValue(testModeCookie);
            const userId = readCookieValue(testUserIdCookie);

            try {
              const response = await fetch(
                `/api/dashboard/releases/${encodeURIComponent(id)}/analytics`,
                {
                  cache: 'no-store',
                  credentials: 'include',
                  headers:
                    mode === testAuthBypassMode && userId
                      ? {
                          [testModeHeader]: mode,
                          [testUserIdHeader]: userId,
                        }
                      : undefined,
                }
              );

              return response.status;
            } catch {
              return 0;
            }
          },
          {
            id: releaseId,
            testAuthBypassMode: TEST_AUTH_BYPASS_MODE,
            testModeCookie: TEST_MODE_COOKIE,
            testModeHeader: TEST_MODE_HEADER,
            testUserIdCookie: TEST_USER_ID_COOKIE,
            testUserIdHeader: TEST_USER_ID_HEADER,
          }
        );
      },
      { timeout: 30_000 }
    )
    .toBe(200);
}

async function waitForReleaseAnalyticsReady(page: Page, releaseId: string) {
  await waitForReleaseAnalyticsRoute(page, releaseId);

  const analyticsCard = page.getByTestId('release-smart-link-analytics');
  await expect(analyticsCard).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(
      async () => {
        return analyticsCard.evaluate(
          (
            node,
            {
              totalClicksMetricTestId,
              totalClicksValueTestId,
              last7DaysMetricTestId,
              last7DaysValueTestId,
            }
          ) => {
            if (!(node instanceof HTMLElement)) {
              return 'missing';
            }

            if (node.getAttribute('aria-busy') === 'true') {
              return 'loading';
            }

            const text = node.innerText.replace(/\s+/g, ' ').trim();
            if (text.includes('Analytics unavailable')) {
              return 'error';
            }

            const totalClicksMetric = node.querySelector<HTMLElement>(
              `[data-testid="${totalClicksMetricTestId}"]`
            );
            const totalClicksValue = node.querySelector<HTMLElement>(
              `[data-testid="${totalClicksValueTestId}"]`
            );
            const last7DaysMetric = node.querySelector<HTMLElement>(
              `[data-testid="${last7DaysMetricTestId}"]`
            );
            const last7DaysValue = node.querySelector<HTMLElement>(
              `[data-testid="${last7DaysValueTestId}"]`
            );

            if (
              !totalClicksMetric ||
              !totalClicksValue ||
              !last7DaysMetric ||
              !last7DaysValue
            ) {
              return 'missing-metrics';
            }

            const numericMetricPattern = /^[\d,]+$/u;
            return numericMetricPattern.test(
              totalClicksValue.innerText.trim()
            ) && numericMetricPattern.test(last7DaysValue.innerText.trim())
              ? 'ready'
              : 'invalid-metric-values';
          },
          {
            totalClicksMetricTestId: TOTAL_CLICKS_METRIC_TEST_ID,
            totalClicksValueTestId: TOTAL_CLICKS_METRIC_VALUE_TEST_ID,
            last7DaysMetricTestId: LAST_7_DAYS_METRIC_TEST_ID,
            last7DaysValueTestId: LAST_7_DAYS_METRIC_VALUE_TEST_ID,
          }
        );
      },
      { timeout: 30_000 }
    )
    .toBe('ready');
}

async function waitForDemoSceneReady(
  page: Page,
  {
    readyLocator,
    readyText,
    forbiddenSelectors = LOADING_SELECTORS,
  }: DemoSceneReadyOptions
) {
  await installCleanupStyle(page);
  await expect(readyLocator).toBeVisible({ timeout: 30_000 });
  if (readyText) {
    await expect(page.locator('body')).toContainText(readyText, {
      timeout: 30_000,
    });
  }
  await waitForSceneCleanup(page, forbiddenSelectors);
  await waitForAnimationFrames(page);
}

async function waitForReleaseSidebar(
  page: Page,
  release: { id: string; title: string }
) {
  await expect(
    page
      .locator(
        '[data-testid="drawer-loading-skeleton"], [data-testid="release-sidebar"]'
      )
      .first()
  ).toBeVisible({ timeout: 30_000 });

  const sidebar = page.getByTestId('release-sidebar');
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  await expect(sidebar).toContainText(release.title, { timeout: 30_000 });
  await waitForReleaseAnalyticsReady(page, release.id);
  await waitForSceneCleanup(page);
  await waitForAnimationFrames(page);
  return sidebar;
}

async function waitForReleaseLinksView(page: Page) {
  const linksTab = page.getByTestId('drawer-tab-links');
  await expect(linksTab).toBeVisible({ timeout: 30_000 });
  await linksTab.click();

  const platformsCard = page.getByTestId('release-platforms-card');
  await expect(platformsCard).toBeVisible({ timeout: 30_000 });

  const providerRows = platformsCard.locator('[data-surface-variant="track"]');
  await expect(providerRows.first()).toBeVisible({ timeout: 30_000 });
  await waitForSceneCleanup(page);
  await waitForAnimationFrames(page);
  return platformsCard;
}

async function prewarmReleaseSidebar(
  page: Page,
  release: { readonly title: string; readonly id: string }
) {
  try {
    const releaseRow = await getSeededReleaseRow(page, release.title);
    await releaseRow.scrollIntoViewIfNeeded();
    const releaseTrigger = await getReleaseRowTrigger(releaseRow);
    await releaseTrigger.click();

    const sidebar = page.getByTestId('release-sidebar');
    const loadingSkeleton = page.getByLabel('Loading release details');
    await Promise.race([
      sidebar.waitFor({ state: 'visible', timeout: 12_000 }),
      loadingSkeleton.waitFor({ state: 'visible', timeout: 12_000 }),
    ]).catch(() => {});

    if (await sidebar.isVisible().catch(() => false)) {
      await waitForReleaseLinksView(page).catch(() => {});
    }
  } catch {
    // Warmup is best-effort only. The recorded pass still enforces real readiness.
  }
}

async function getReleaseRowTitle(row: Locator) {
  const openButton = row.locator('button[aria-label^="Open "]').first();
  if ((await openButton.count()) > 0) {
    const label = await openButton.getAttribute('aria-label');
    const buttonTitle = label?.replace(/^Open\s+/, '').trim();
    if (buttonTitle) {
      return buttonTitle;
    }
  }

  const firstCell = row.locator('td').first();
  const cellText = (await firstCell.innerText()).trim();
  const [firstLine] = cellText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (!firstLine) {
    throw new Error('Could not resolve a release title from the visible row');
  }

  return firstLine;
}

async function getReleaseRowTrigger(row: Locator) {
  const openButton = row.locator('button[aria-label^="Open "]').first();
  if ((await openButton.count()) > 0) {
    return openButton;
  }

  const firstCell = row.locator('td').first();
  if ((await firstCell.count()) > 0) {
    return firstCell;
  }

  return row;
}

async function getSeededReleaseRow(page: Page, releaseTitle: string) {
  const escapedTitle = escapeRegExp(releaseTitle);
  const row = page
    .locator('tbody tr')
    .filter({
      has: page.getByRole('button', {
        name: new RegExp(`^Open\\s+${escapedTitle}$`),
      }),
    })
    .first();

  if ((await row.count()) > 0) {
    return row;
  }

  return page.locator('tbody tr', { hasText: releaseTitle }).first();
}

async function gotoDemoScene(
  page: Page,
  url: string,
  options: DemoSceneReadyOptions
) {
  await page.goto(url, {
    waitUntil: 'commit',
    timeout: 120_000,
  });
  await page
    .waitForLoadState('domcontentloaded', { timeout: 10_000 })
    .catch(() => {});
  await waitForDemoSceneReady(page, options);
}

async function gotoDemoSceneWithTransition(
  page: Page,
  url: string,
  options: DemoSceneReadyOptions
) {
  if (page.url() !== 'about:blank') {
    await setTransitionVeilVisible(page, true);
  }
  await gotoDemoScene(page, url, options);
  await setTransitionVeilVisible(page, false);
  await page.waitForTimeout(TRANSITION_FADE_MS);
}

async function openSubscribeDrawerOnProfile(page: Page) {
  await setTransitionVeilVisible(page, true);
  await page.evaluate(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('mode', 'subscribe');
    window.history.pushState(window.history.state, '', nextUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const drawer = page.getByTestId('profile-menu-drawer');
  const subscribeDrawer = page.getByTestId('profile-mode-drawer-subscribe');
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  await expect(subscribeDrawer).toBeVisible({ timeout: 30_000 });
  await expect(subscribeDrawer.locator('input').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(PROFILE_SKELETON_SELECTOR)).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(subscribeDrawer.locator('output[aria-busy="true"]')).toHaveCount(
    0,
    {
      timeout: 30_000,
    }
  );
  await waitForSceneCleanup(page, [
    ...LOADING_SELECTORS,
    PROFILE_SKELETON_SELECTOR,
  ]);
  await waitForAnimationFrames(page);
  await setTransitionVeilVisible(page, false);
  await page.waitForTimeout(TRANSITION_FADE_MS);
}

async function waitForReleaseTasksView(page: Page) {
  const tasksTab = page.getByTestId('drawer-tab-tasks');
  await expect(tasksTab).toBeVisible({ timeout: 30_000 });
  await tasksTab.click();

  const tasksCard = page.getByTestId('release-tasks-card');
  await expect(tasksCard).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('release-tasks-loading-state')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(
    page.getByTestId('release-task-empty-state-compact')
  ).toHaveCount(0);
  await expect(tasksCard).toContainText(/\d+\/\d+\s+done/);
  await expect(tasksCard).toContainText('AI');
  await waitForSceneCleanup(page);
  await waitForAnimationFrames(page);
  return tasksCard;
}

async function smoothScrollPage(
  page: Page,
  positions: number[],
  pauseMs = 950
) {
  for (const top of positions) {
    await page.evaluate(scrollTop => {
      window.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }, top);
    await waitForAnimationFrames(page, 2);
    await page.waitForTimeout(pauseMs);
  }
}

test.describe('YC Demo Recording', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    const dbUrl = process.env.DATABASE_URL ?? '';
    if (dbUrl.includes('production') || dbUrl.includes('prod')) {
      test.skip(true, 'Refusing to record against a production database');
    }
    if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') {
      test.skip(true, 'Set E2E_USE_TEST_AUTH_BYPASS=1 to record the demo');
    }
    if (!process.env.DEMO_CLERK_USER_ID?.trim()) {
      test.skip(true, 'DEMO_CLERK_USER_ID not configured');
    }

    await interceptTrackingCalls(page);
  });

  test('yc demo - zero to release-ready in one cascade', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000);

    const demoClerkUserId = process.env.DEMO_CLERK_USER_ID?.trim();
    const cookieBaseUrl =
      baseURL ?? process.env.BASE_URL ?? 'http://localhost:3100';
    const manifestReleaseSequence = getTimWhiteDashboardReleaseSequence();
    const featuredManifestRelease = getTimWhiteDemoReleaseById(
      TIM_WHITE_DEMO_MANIFEST.featuredReleaseId
    );
    const upcomingManifestRelease = getTimWhiteDemoReleaseById(
      TIM_WHITE_DEMO_MANIFEST.upcomingReleaseId
    );

    if (!demoClerkUserId) {
      throw new Error('DEMO_CLERK_USER_ID is required');
    }

    await configureRecordingContext(page.context(), cookieBaseUrl);

    const [seededHandle, seededReleases] = await Promise.all([
      getDemoUserHandle(demoClerkUserId),
      getDemoReleasesForUserByTitles(
        demoClerkUserId,
        manifestReleaseSequence.map(release => release.title)
      ),
    ]);

    if (!seededHandle) {
      throw new Error(
        'Demo user handle not found. Run apps/web/scripts/seed-demo-account.ts first.'
      );
    }

    const seededReleasesByTitle = new Map(
      seededReleases.map(release => {
        const title = assertReleaseTitle(release.title);
        return [title.toLowerCase(), { ...release, title }] as const;
      })
    );
    const selectedReleases = manifestReleaseSequence.map(release => {
      const seededRelease = seededReleasesByTitle.get(
        release.title.toLowerCase()
      );
      if (!seededRelease) {
        throw new Error(
          `Expected seeded demo release "${release.title}" for the recorder sequence.`
        );
      }
      return seededRelease;
    });
    const featuredRelease =
      selectedReleases.find(
        release => release.title === featuredManifestRelease.title
      ) ?? null;
    const upcomingRelease =
      selectedReleases.find(
        release => release.title === upcomingManifestRelease.title
      ) ?? null;

    if (!featuredRelease || !upcomingRelease) {
      throw new Error(
        'Expected featured and upcoming Tim White releases for the demo recorder.'
      );
    }

    const publicHandle = seededHandle;
    const warmupPage = page;

    await authenticateDemoPage(warmupPage, demoClerkUserId);
    await gotoDemoScene(warmupPage, '/app/dashboard/releases', {
      readyLocator: warmupPage.getByTestId('releases-matrix'),
      readyText: 'Releases',
    });
    await prewarmReleaseSidebar(warmupPage, featuredRelease);
    await waitForReleaseTasksView(warmupPage).catch(() => {});

    await clearDemoAuthCookies(warmupPage.context(), cookieBaseUrl);

    await gotoDemoScene(
      warmupPage,
      `/${publicHandle}/${featuredRelease.slug}?noredirect=1`,
      {
        readyLocator: warmupPage.locator('body'),
        readyText: featuredRelease.title,
      }
    );
    await gotoDemoScene(warmupPage, `/${publicHandle}`, {
      readyLocator: warmupPage.getByTestId('profile-latest-release-card'),
      readyText: PUBLIC_PROFILE_READY_TEXT,
    });
    await openSubscribeDrawerOnProfile(warmupPage);

    const demoPage = await page.context().newPage();
    await interceptTrackingCalls(demoPage);
    await warmupPage.close();

    await gotoDemoSceneWithTransition(demoPage, '/', {
      readyLocator: demoPage.getByTestId('hero-heading'),
      readyText: HOME_READY_TEXT,
    });
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'Start empty. Connect one artist. Everything else appears.'
    );
    await expect(demoPage.getByTestId('cookie-banner')).toHaveCount(0);
    await expect(demoPage.getByTestId('dev-toolbar')).toHaveCount(0);
    await demoPage.waitForTimeout(HOME_FRAME_SETTLE_MS);

    await authenticateDemoPage(demoPage, demoClerkUserId);

    await gotoDemoSceneWithTransition(demoPage, '/app/dashboard/releases', {
      readyLocator: demoPage.getByTestId('releases-matrix'),
      readyText: 'Releases',
    });
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'One Spotify connection. Every release imported and ready to work.'
    );
    await demoPage.waitForTimeout(FRAME_SETTLE_MS);

    await setCaption(
      demoPage,
      'Click any release. Jovie opens the full release workspace instantly.'
    );

    for (const release of selectedReleases.slice(0, 3)) {
      const releaseRow = await getSeededReleaseRow(demoPage, release.title);
      await expect(releaseRow).toBeVisible({ timeout: 30_000 });
      await releaseRow.scrollIntoViewIfNeeded();
      const releaseTitle = await getReleaseRowTitle(releaseRow);
      expect(releaseTitle).toBe(release.title);
      const releaseTrigger = await getReleaseRowTrigger(releaseRow);
      await expect(releaseTrigger).toBeVisible({ timeout: 30_000 });
      await releaseTrigger.click();
      await waitForReleaseSidebar(demoPage, release);
      const platformsCard = await waitForReleaseLinksView(demoPage);
      await expect(
        platformsCard.locator('[data-surface-variant="track"]').first()
      ).toContainText('Spotify');
      if (release.title === featuredManifestRelease.title) {
        await expect(platformsCard).toContainText('Popular');
      }
      await demoPage.waitForTimeout(1_150);
    }

    await clearCaption(demoPage);

    const featuredReleaseRow = await getSeededReleaseRow(
      demoPage,
      featuredRelease.title
    );
    await expect(featuredReleaseRow).toBeVisible({ timeout: 30_000 });
    await featuredReleaseRow.scrollIntoViewIfNeeded();
    const featuredReleaseTrigger =
      await getReleaseRowTrigger(featuredReleaseRow);
    await featuredReleaseTrigger.click();
    await waitForReleaseSidebar(demoPage, featuredRelease);
    const tasksCard = await waitForReleaseTasksView(demoPage);
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      `Every release gets a campaign: ${TASK_COUNT} tasks, ${AUTO_TASK_COUNT} already handled by Jovie.`
    );
    await tasksCard
      .getByTestId('release-task-checklist-scroll-region')
      .evaluate(node => {
        node.scrollTo({ top: 220, behavior: 'smooth' });
      })
      .catch(() => {});
    await waitForAnimationFrames(demoPage, 2);
    await demoPage.waitForTimeout(2_100);
    await clearCaption(demoPage);

    await clearDemoAuthCookies(demoPage.context(), cookieBaseUrl);

    await gotoDemoSceneWithTransition(
      demoPage,
      `/${publicHandle}/${featuredRelease.slug}?noredirect=1`,
      {
        readyLocator: demoPage.locator('body'),
        readyText: featuredRelease.title,
      }
    );
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'Smart link live with every platform and tracking built in.'
    );
    await demoPage.waitForTimeout(2_200);
    await clearCaption(demoPage);

    await gotoDemoSceneWithTransition(demoPage, `/${publicHandle}`, {
      readyLocator: demoPage.getByTestId('profile-latest-release-card'),
      readyText: PUBLIC_PROFILE_READY_TEXT,
    });
    await injectCaptionOverlay(demoPage);
    await expect(demoPage.locator('body')).toContainText(FOUNDER_DISPLAY_NAME, {
      timeout: 30_000,
    });
    await expect(
      demoPage.getByTestId('profile-latest-release-card')
    ).toContainText(upcomingRelease.title);
    await expect(
      demoPage.getByTestId('profile-latest-release-timing')
    ).toContainText(/Coming .* • .*days?/);
    await setCaption(
      demoPage,
      'Artist page already live. The next release is already counting down.'
    );
    await smoothScrollPage(demoPage, [120], 950);
    await demoPage.waitForTimeout(900);
    await clearCaption(demoPage);

    await openSubscribeDrawerOnProfile(demoPage);
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'Fans subscribe once. New release notifications go out automatically.'
    );
    await demoPage.waitForTimeout(2_800);
    await clearCaption(demoPage);

    const video = demoPage.video();
    if (video) {
      await demoPage.close();
      await video.saveAs('test-results/yc-demo.webm');
      console.log('[yc-demo] Video saved to test-results/yc-demo.webm');
    }
  });
});
