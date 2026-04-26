import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import { FF_OVERRIDES_KEY } from '@/lib/flags/overrides';
import { RELEASE_PLAN_MOVE_REMIX_NEAR_LA } from '@/lib/release-planning/demo-events';
import {
  generateDemoPlan,
  moveRemixNearLAShow,
} from '@/lib/release-planning/demo-plan';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  setTestAuthBypassSession,
  waitForAuthenticatedHealth,
} from '@/tests/helpers/clerk-auth';
import {
  getDemoUserHandle,
  getTopDemoReleasesForUser,
  interceptTrackingCalls,
} from './helpers/e2e-helpers';

const TASK_COUNT = DEFAULT_RELEASE_TASK_TEMPLATE.length;
const AUTO_TASK_COUNT = DEFAULT_RELEASE_TASK_TEMPLATE.filter(
  item => item.assigneeType === 'ai_workflow'
).length;
const FIRST_TASK_TITLE =
  DEFAULT_RELEASE_TASK_TEMPLATE[0]?.title ?? 'Release tasks';
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
const TOTAL_CLICKS_METRIC_TEST_ID = 'drawer-analytics-metric-total-clicks';
const TOTAL_CLICKS_METRIC_VALUE_TEST_ID =
  'drawer-analytics-metric-value-total-clicks';
const LAST_7_DAYS_METRIC_TEST_ID = 'drawer-analytics-metric-last-7-days-clicks';
const LAST_7_DAYS_METRIC_VALUE_TEST_ID =
  'drawer-analytics-metric-value-last-7-days-clicks';

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
  await context.addInitScript(() => {
    localStorage.setItem('jv_cc', '1');
    localStorage.removeItem('__dev_toolbar_open');
    localStorage.removeItem('__dev_toolbar_hidden');

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
        existing.style.pointerEvents = isTransitionVisible() ? 'auto' : 'none';
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
  });

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

async function enableReleasePlanDemoFlag(page: Page) {
  await page.addInitScript(
    ({ key, overrideKey }) => {
      try {
        const existing = localStorage.getItem(key);
        const parsed: Record<string, boolean> = existing
          ? JSON.parse(existing)
          : {};
        parsed[overrideKey] = true;
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        // localStorage may be unavailable (e.g. about:blank); ignore.
      }
    },
    {
      key: FF_OVERRIDES_KEY,
      overrideKey: APP_FLAG_OVERRIDE_KEYS.RELEASE_PLAN_DEMO,
    }
  );
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
        return analyticsCard.evaluate(node => {
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
            `[data-testid="${TOTAL_CLICKS_METRIC_TEST_ID}"]`
          );
          const totalClicksValue = node.querySelector<HTMLElement>(
            `[data-testid="${TOTAL_CLICKS_METRIC_VALUE_TEST_ID}"]`
          );
          const last7DaysMetric = node.querySelector<HTMLElement>(
            `[data-testid="${LAST_7_DAYS_METRIC_TEST_ID}"]`
          );
          const last7DaysValue = node.querySelector<HTMLElement>(
            `[data-testid="${LAST_7_DAYS_METRIC_VALUE_TEST_ID}"]`
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
          return numericMetricPattern.test(totalClicksValue.innerText.trim()) &&
            numericMetricPattern.test(last7DaysValue.innerText.trim())
            ? 'ready'
            : 'invalid-metric-values';
        });
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

    if (!demoClerkUserId) {
      throw new Error('DEMO_CLERK_USER_ID is required');
    }

    await configureRecordingContext(page.context(), cookieBaseUrl);

    const [seededHandle, topReleases] = await Promise.all([
      getDemoUserHandle(demoClerkUserId),
      getTopDemoReleasesForUser(demoClerkUserId, 3),
    ]);

    if (!seededHandle) {
      throw new Error(
        'Demo user handle not found. Run apps/web/scripts/seed-demo-account.ts first.'
      );
    }

    if (topReleases.length < 3) {
      throw new Error(
        'Expected three seeded releases for the demo drawer sequence.'
      );
    }

    const selectedReleases = topReleases.map(release => ({
      ...release,
      title: assertReleaseTitle(release.title),
    }));
    const featuredRelease = selectedReleases[2];
    const publicHandle = seededHandle;

    const demoPage = page;

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
      await demoPage.waitForTimeout(1_150);
    }

    await clearCaption(demoPage);

    await gotoDemoSceneWithTransition(
      demoPage,
      `/app/dashboard/releases/${featuredRelease.id}/tasks`,
      {
        readyLocator: demoPage.getByText(FIRST_TASK_TITLE).first(),
        readyText: FIRST_TASK_TITLE,
      }
    );
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      `Every release gets a campaign: ${TASK_COUNT} tasks, ${AUTO_TASK_COUNT} already handled by Jovie.`
    );
    await smoothScrollPage(demoPage, [180, 420, 700], 1_000);
    await demoPage.waitForTimeout(900);
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
      readyLocator: demoPage.locator('body'),
      readyText: PUBLIC_PROFILE_READY_TEXT,
    });
    await injectCaptionOverlay(demoPage);
    await expect(demoPage.locator('body')).toContainText(FOUNDER_DISPLAY_NAME, {
      timeout: 30_000,
    });
    await setCaption(
      demoPage,
      'Artist page already live. Latest release featured automatically.'
    );
    await smoothScrollPage(demoPage, [120], 950);
    await demoPage.waitForTimeout(900);
    await clearCaption(demoPage);

    await gotoDemoSceneWithTransition(
      demoPage,
      `/${publicHandle}?mode=subscribe`,
      {
        readyLocator: demoPage.locator('body'),
        readyText: /turn on notifications|never miss a release/i,
      }
    );
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

  test('release plan - move remix near LA show', async ({ page, baseURL }) => {
    test.setTimeout(120_000);

    const expectedNewRemixFriday = moveRemixNearLAShow(generateDemoPlan()).find(
      m => m.momentType === 'remix'
    )?.friday;
    if (!expectedNewRemixFriday) {
      throw new Error('Expected remix moment missing from generated plan');
    }

    const demoClerkUserId = process.env.DEMO_CLERK_USER_ID?.trim();
    const cookieBaseUrl =
      baseURL ?? process.env.BASE_URL ?? 'http://localhost:3100';
    if (!demoClerkUserId) {
      throw new Error('DEMO_CLERK_USER_ID is required');
    }

    await configureRecordingContext(page.context(), cookieBaseUrl);
    await enableReleasePlanDemoFlag(page);
    await page.setViewportSize({ width: 1920, height: 1080 });

    await authenticateDemoPage(page, demoClerkUserId);
    await page.goto(APP_ROUTES.DASHBOARD_RELEASE_PLAN);

    await expect(page.getByTestId('release-plan-empty-state')).toBeVisible({
      timeout: 30_000,
    });
    for (const i of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`release-plan-track-${i}`)).toBeVisible();
    }

    await page.getByTestId('release-plan-generate-button').click();
    await expect(page.getByTestId('release-calendar')).toBeVisible();

    const cards = page.locator('[data-testid^="release-moment-card-"]');
    await expect(cards).toHaveCount(12);

    const remixCards = page.locator('[data-moment-type="remix"]');
    await expect(remixCards).toHaveCount(1);
    const originalRemixFriday = await remixCards
      .first()
      .getAttribute('data-release-date');
    expect(originalRemixFriday).toBeTruthy();
    expect(originalRemixFriday).not.toBe(expectedNewRemixFriday);

    await expect(page.getByTestId('release-tour-date-la')).toBeVisible();

    const chatInput = page.getByLabel('Chat message input').first();
    await expect(chatInput).toBeVisible({ timeout: 30_000 });
    await chatInput.fill('Move the remix closer to the LA show');
    await page.getByLabel('Send message').first().click();

    await expect(page.getByTestId('chat-content')).toContainText(
      expectedNewRemixFriday,
      { timeout: 10_000 }
    );

    await expect(remixCards).toHaveCount(1);
    await expect(remixCards.first()).toHaveAttribute(
      'data-release-date',
      expectedNewRemixFriday
    );

    await remixCards.first().click();
    await expect(page.getByTestId('release-moment-drawer')).toBeVisible();

    const workflowTasks = page.locator(
      '[data-testid^="release-moment-workflow-task-"]'
    );
    await expect(workflowTasks.first()).toBeVisible();
    const taskCount = await workflowTasks.count();
    expect(taskCount).toBeGreaterThan(0);
    for (let i = 0; i < taskCount; i++) {
      const rd = await workflowTasks.nth(i).getAttribute('data-relative-days');
      expect(Number.isFinite(Number(rd))).toBe(true);
    }

    await expect(page.getByTestId('fan-notification-preview')).toContainText(
      expectedNewRemixFriday
    );

    await page.getByTestId('release-moment-drawer-close').click();
    await expect(page.getByTestId('release-moment-drawer')).toHaveCount(0);
  });

  test('release plan recording - wedge demo video', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);

    const expectedRemixFriday = moveRemixNearLAShow(generateDemoPlan()).find(
      m => m.momentType === 'remix'
    )?.friday;
    if (!expectedRemixFriday) {
      throw new Error('Expected remix moment missing from generated plan');
    }

    const demoClerkUserId = process.env.DEMO_CLERK_USER_ID?.trim();
    const cookieBaseUrl =
      baseURL ?? process.env.BASE_URL ?? 'http://localhost:3100';
    if (!demoClerkUserId) {
      throw new Error('DEMO_CLERK_USER_ID is required');
    }

    await configureRecordingContext(page.context(), cookieBaseUrl);
    await enableReleasePlanDemoFlag(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await authenticateDemoPage(page, demoClerkUserId);

    await gotoDemoSceneWithTransition(page, APP_ROUTES.DASHBOARD_RELEASE_PLAN, {
      readyLocator: page.getByTestId('release-plan-empty-state'),
      readyText: 'Release plan',
    });
    await injectCaptionOverlay(page);
    await setCaption(page, "That's one release. Now plan the whole year.");
    await page.waitForTimeout(1_800);

    await page.getByTestId('release-plan-generate-button').click();
    await expect(page.getByTestId('release-calendar')).toBeVisible({
      timeout: 15_000,
    });
    await setCaption(
      page,
      '12 release moments. One Friday cadence. Tour dates inline.'
    );
    await page.waitForTimeout(2_400);

    await setCaption(page, 'You: "Move the remix closer to the LA show."');
    await page.waitForTimeout(2_400);
    await page.evaluate(eventName => {
      window.dispatchEvent(new CustomEvent(eventName));
    }, RELEASE_PLAN_MOVE_REMIX_NEAR_LA);
    await expect(
      page.locator('[data-moment-type="remix"]').first()
    ).toHaveAttribute('data-release-date', expectedRemixFriday, {
      timeout: 10_000,
    });
    await setCaption(
      page,
      'Workflows, due dates, and fan notifications follow.'
    );
    await page.waitForTimeout(2_000);

    await page.locator('[data-moment-type="remix"]').first().click();
    await expect(page.getByTestId('release-moment-drawer')).toBeVisible({
      timeout: 5_000,
    });
    await setCaption(
      page,
      'Workflow recomputes from the new Friday. Fans get the right ping.'
    );
    await page.waitForTimeout(2_400);
    await clearCaption(page);

    const video = page.video();
    if (video) {
      await page.close();
      await video.saveAs('test-results/release-plan-demo.webm');
      console.log(
        '[release-plan-demo] Video saved to test-results/release-plan-demo.webm'
      );
    }
  });
});
