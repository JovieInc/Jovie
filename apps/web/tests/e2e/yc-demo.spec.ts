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
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';
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
const PUBLIC_DEMO_HANDLE = 'tim';
const FRAME_SETTLE_MS = 1_250;
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
  '[class*="animate-pulse"]',
];

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

async function addDemoAuthCookies(
  context: BrowserContext,
  cookieBaseUrl: string,
  clerkUserId: string
) {
  await context.addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: cookieBaseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: clerkUserId,
      url: cookieBaseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_PERSONA_COOKIE,
      value: 'creator',
      url: cookieBaseUrl,
      sameSite: 'Lax',
    },
  ]);
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

async function injectCaptionOverlay(page: Page) {
  await installCleanupStyle(page);
  await page.evaluate(() => {
    if (document.getElementById('demo-caption')) return;

    const el = document.createElement('div');
    el.id = 'demo-caption';
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '32px',
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

async function gotoDemoScene(
  page: Page,
  url: string,
  options: DemoSceneReadyOptions
) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await waitForDemoSceneReady(page, options);
}

async function warmupRoute(
  page: Page,
  url: string,
  options: DemoSceneReadyOptions
) {
  await gotoDemoScene(page, url, options);
}

async function warmupDemoRoutes(
  page: Page,
  cookieBaseUrl: string,
  clerkUserId: string,
  publicHandle: string,
  releaseId: string,
  releaseSlug: string,
  releaseTitle: string
) {
  const browser = page.context().browser();
  if (!browser) {
    throw new Error('Browser instance required for YC demo warmup');
  }

  const warmupContext = await browser.newContext({
    baseURL: cookieBaseUrl,
    viewport: { width: 1280, height: 720 },
  });

  try {
    await configureRecordingContext(warmupContext, cookieBaseUrl);

    const warmupPage = await warmupContext.newPage();
    await interceptTrackingCalls(warmupPage);

    await warmupRoute(warmupPage, '/', {
      readyLocator: warmupPage.getByTestId('hero-heading'),
      readyText: 'The link your music deserves.',
    });

    await addDemoAuthCookies(warmupContext, cookieBaseUrl, clerkUserId);

    await warmupRoute(warmupPage, '/app/dashboard/releases', {
      readyLocator: warmupPage.getByTestId('releases-matrix'),
      readyText: releaseTitle,
    });
    await warmupRoute(
      warmupPage,
      `/app/dashboard/releases/${releaseId}/tasks`,
      {
        readyLocator: warmupPage.getByText(FIRST_TASK_TITLE).first(),
        readyText: FIRST_TASK_TITLE,
      }
    );

    await clearDemoAuthCookies(warmupContext, cookieBaseUrl);

    await warmupRoute(
      warmupPage,
      `/${publicHandle}/${releaseSlug}?noredirect=1`,
      {
        readyLocator: warmupPage.locator('body'),
        readyText: releaseTitle,
      }
    );
    await warmupRoute(warmupPage, `/${publicHandle}`, {
      readyLocator: warmupPage.locator('body'),
      readyText: 'Calvin Harris',
    });
    await warmupRoute(warmupPage, `/${publicHandle}?mode=subscribe`, {
      readyLocator: warmupPage.locator('body'),
      readyText: /turn on notifications|never miss a release/i,
    });
  } finally {
    await warmupContext.close();
  }
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
    const publicHandle =
      seededHandle === 'timwhite' ? PUBLIC_DEMO_HANDLE : seededHandle;

    await warmupDemoRoutes(
      page,
      cookieBaseUrl,
      demoClerkUserId,
      publicHandle,
      featuredRelease.id,
      featuredRelease.slug,
      featuredRelease.title
    );

    const demoPage = await page.context().newPage();
    await interceptTrackingCalls(demoPage);
    await page.close();

    await gotoDemoScene(demoPage, '/', {
      readyLocator: demoPage.getByTestId('hero-heading'),
      readyText: 'The link your music deserves.',
    });
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'Start empty. Connect one artist. Everything else appears.'
    );
    await expect(demoPage.getByTestId('cookie-banner')).toHaveCount(0);
    await expect(demoPage.getByTestId('dev-toolbar')).toHaveCount(0);
    await demoPage.waitForTimeout(FRAME_SETTLE_MS);

    await addDemoAuthCookies(
      demoPage.context(),
      cookieBaseUrl,
      demoClerkUserId
    );

    await gotoDemoScene(demoPage, '/app/dashboard/releases', {
      readyLocator: demoPage.getByTestId('releases-matrix'),
      readyText: selectedReleases[0].title,
    });
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'One Spotify connection. Every release imported and ready to work.'
    );
    await demoPage.waitForTimeout(FRAME_SETTLE_MS);

    const releasesMatrix = demoPage.getByTestId('releases-matrix');
    const releaseSidebar = demoPage.getByTestId('release-sidebar');
    await setCaption(
      demoPage,
      'Click any release. Jovie opens the full release workspace instantly.'
    );

    for (const release of selectedReleases) {
      const releaseRow = releasesMatrix.getByText(release.title, {
        exact: true,
      });
      await expect(releaseRow.first()).toBeVisible({ timeout: 30_000 });
      await releaseRow.first().click();
      await waitForDemoSceneReady(demoPage, {
        readyLocator: releaseSidebar,
        readyText: release.title,
      });
      await demoPage.waitForTimeout(1_150);
    }

    await clearCaption(demoPage);

    await gotoDemoScene(
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

    await gotoDemoScene(
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

    await gotoDemoScene(demoPage, `/${publicHandle}`, {
      readyLocator: demoPage.locator('body'),
      readyText: 'Calvin Harris',
    });
    await injectCaptionOverlay(demoPage);
    await setCaption(
      demoPage,
      'Artist page already live. Latest release featured automatically.'
    );
    await smoothScrollPage(demoPage, [120], 950);
    await demoPage.waitForTimeout(900);
    await clearCaption(demoPage);

    await gotoDemoScene(demoPage, `/${publicHandle}?mode=subscribe`, {
      readyLocator: demoPage.locator('body'),
      readyText: /turn on notifications|never miss a release/i,
    });
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
