import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

type ShellVariant = 'legacy' | 'v2';
type ThemeVariant = 'dark' | 'light';
type BreakpointVariant = 'mobile' | 'tablet' | 'desktop';

interface BreakpointConfig {
  readonly name: BreakpointVariant;
  readonly width: number;
  readonly height: number;
}

interface ProfileAuditCase {
  readonly id: string;
  readonly path: string;
  readonly readySelector: string;
  readonly shells: readonly ShellVariant[];
  readonly composerVisible?: boolean;
  readonly focusComposerInput?: boolean;
}

const TEST_PROFILE = 'dualipa';
const TIP_PROFILE = 'testartist';
const NOTIFICATIONS_PROFILE = 'testartist';
const PROFILE_READY_SELECTOR = 'h1, [data-testid="profile-header"]';
const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const BREAKPOINTS: readonly BreakpointConfig[] = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];
const THEMES: readonly ThemeVariant[] = ['dark', 'light'];
const PROFILE_CASES: readonly ProfileAuditCase[] = [
  {
    id: 'profile',
    path: `/${TEST_PROFILE}`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy', 'v2'],
  },
  {
    id: 'listen',
    path: `/${TEST_PROFILE}?mode=listen`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy', 'v2'],
  },
  {
    id: 'subscribe',
    path: `/${TEST_PROFILE}?mode=subscribe`,
    readySelector:
      '[data-testid="subscribe-cta-container"], h1, [data-testid="profile-header"]',
    shells: ['legacy', 'v2'],
    composerVisible: true,
  },
  {
    id: 'subscribe-focus',
    path: `/${TEST_PROFILE}?mode=subscribe`,
    readySelector:
      '[data-testid="subscribe-cta-container"], h1, [data-testid="profile-header"]',
    shells: ['legacy', 'v2'],
    composerVisible: true,
    focusComposerInput: true,
  },
  {
    id: 'about',
    path: `/${TEST_PROFILE}?mode=about`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy', 'v2'],
  },
  {
    id: 'tour',
    path: `/${TEST_PROFILE}?mode=tour`,
    readySelector: `#profile-tour-heading, ${PROFILE_READY_SELECTOR}`,
    shells: ['legacy', 'v2'],
  },
  {
    id: 'contact',
    path: `/${TEST_PROFILE}?mode=contact`,
    readySelector: `${PROFILE_READY_SELECTOR}, [data-testid="contact-drawer"]`,
    shells: ['legacy', 'v2'],
  },
  {
    id: 'tip',
    path: `/${TIP_PROFILE}?mode=pay`,
    readySelector: `${PROFILE_READY_SELECTOR}, [data-testid="tip-drawer"]`,
    shells: ['legacy', 'v2'],
  },
  {
    id: 'notifications',
    path: `/${NOTIFICATIONS_PROFILE}/notifications`,
    readySelector: '[data-testid="notifications-page"]',
    shells: ['legacy'],
    composerVisible: true,
  },
  {
    id: 'notifications-focus',
    path: `/${NOTIFICATIONS_PROFILE}/notifications`,
    readySelector: '[data-testid="notifications-page"]',
    shells: ['legacy'],
    composerVisible: true,
    focusComposerInput: true,
  },
];

const FAST_ITERATION_CASE_IDS = new Set<ProfileAuditCase['id']>([
  // Fast-feedback smoke keeps the historically flaky deep-link and drawer paths.
  // Base profile/listen coverage already lives in lighter public smoke specs.
  'subscribe',
  'subscribe-focus',
  'contact',
  'tip',
  'notifications',
  'notifications-focus',
]);

const ACTIVE_PROFILE_CASES = FAST_ITERATION
  ? PROFILE_CASES.filter(routeCase => FAST_ITERATION_CASE_IDS.has(routeCase.id))
  : PROFILE_CASES;

const ACTIVE_THEMES: readonly ThemeVariant[] = FAST_ITERATION
  ? ['dark']
  : THEMES;

const ACTIVE_BREAKPOINTS: readonly BreakpointConfig[] = FAST_ITERATION
  ? BREAKPOINTS.filter(
      breakpoint =>
        breakpoint.name === 'mobile' || breakpoint.name === 'desktop'
    )
  : BREAKPOINTS;

const DEV_OVERLAY_SELECTORS = [
  '[data-sonner-toaster]',
  '[data-testid="cookie-banner"], [data-cookie-banner]',
  '[role="tooltip"]',
  '#intercom-container, .intercom-lightweight-app',
  '[data-testid="dev-toolbar"]',
  '.tsqd-parent-container',
  'button[aria-label*="query devtools" i]',
  '#vercel-toolbar',
  '[data-nextjs-dialog-overlay]',
  '[data-nextjs-toast]',
  'nextjs-portal',
  '[data-nextjs-build-indicator]',
] as const;

const WEB_ROOT = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : path.resolve(process.cwd(), 'apps/web');
const REPO_ROOT = path.resolve(WEB_ROOT, '..', '..');
const cycleName = process.env.PROFILE_AUDIT_CYCLE ?? 'cycle-01';
const cycleDir = path.join(REPO_ROOT, '.context/profile-audit', cycleName);

function withShellVariant(routePath: string, shell: ShellVariant): string {
  if (shell === 'legacy') {
    return routePath;
  }

  const separator = routePath.includes('?') ? '&' : '?';
  return `${routePath}${separator}ff_profile_v2=1`;
}

function screenshotName(
  shell: ShellVariant,
  theme: ThemeVariant,
  breakpoint: BreakpointVariant,
  routeId: string
): string {
  return `${shell}-${theme}-${breakpoint}-${routeId}.png`;
}

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/px', route =>
    route.fulfill({ status: 204, body: '' })
  );
}

async function waitForSettle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(1500);
}

async function waitForImages(page: import('@playwright/test').Page) {
  await page
    .waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.every(
        img =>
          (img as HTMLImageElement).complete &&
          (img as HTMLImageElement).naturalWidth > 0
      );
    })
    .catch(() => undefined);
}

async function hideTransientUi(page: import('@playwright/test').Page) {
  await page.evaluate((selectors: readonly string[]) => {
    const hide = (selector: string) => {
      document.querySelectorAll(selector).forEach(element => {
        (element as HTMLElement).style.display = 'none';
      });
    };

    selectors.forEach(hide);
  }, DEV_OVERLAY_SELECTORS);
}

async function assertNoDevOverlays(page: import('@playwright/test').Page) {
  const visibleSelectors = await page.evaluate(
    (selectors: readonly string[]) => {
      const visible: string[] = [];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const style = window.getComputedStyle(element as HTMLElement);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            visible.push(selector);
            break;
          }
        }
      }

      return visible;
    },
    DEV_OVERLAY_SELECTORS
  );

  if (visibleSelectors.length > 0) {
    throw new Error(
      `Dev overlay(s) still visible before screenshot: ${visibleSelectors.join(', ')}`
    );
  }
}

async function waitForVisibleSelector(
  page: import('@playwright/test').Page,
  selector: string
) {
  const locator = page.locator(selector);

  await expect
    .poll(
      async () => {
        const count = await locator.count();

        for (let index = 0; index < count; index += 1) {
          if (
            await locator
              .nth(index)
              .isVisible()
              .catch(() => false)
          ) {
            return true;
          }
        }

        return false;
      },
      {
        timeout: 60_000,
        message: `Expected a visible element matching selector: ${selector}`,
      }
    )
    .toBe(true);
}

async function ensureComposerVisible(page: import('@playwright/test').Page) {
  const composerSelectors = [
    '[data-testid="profile-mobile-notifications-flow"]',
    '[data-testid="profile-mobile-notifications-step-intro"]',
    '[data-testid="profile-mobile-notifications-step-email"]',
  ] as const;

  const hasVisibleComposer = async () => {
    for (const selector of composerSelectors) {
      const composer = page.locator(selector);
      const count = await composer.count();
      for (let index = count - 1; index >= 0; index -= 1) {
        if (
          await composer
            .nth(index)
            .isVisible()
            .catch(() => false)
        ) {
          return true;
        }
      }
    }

    return false;
  };

  if (await hasVisibleComposer()) {
    return;
  }

  const revealCandidates = [
    page.getByRole('button', {
      name: /turn on notifications|get notified|manage alerts|manage notification preferences/i,
    }),
    page.locator('[data-testid="profile-inline-notifications-trigger"]'),
    page.locator('[data-testid="subscribe-cta-container"] button'),
    page.locator('[data-testid="notifications-page"] button'),
  ];

  for (const candidate of revealCandidates) {
    const trigger = candidate.first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
      await trigger.click();
      break;
    }
  }

  if (await hasVisibleComposer()) {
    return;
  }

  await waitForVisibleSelector(
    page,
    '[data-testid="profile-mobile-notifications-flow"], [data-testid="profile-mobile-notifications-step-intro"], [data-testid="profile-mobile-notifications-step-email"]'
  );
}

async function focusComposerInput(page: import('@playwright/test').Page) {
  const introStep = page
    .getByTestId('profile-mobile-notifications-step-intro')
    .last();
  if (await introStep.isVisible().catch(() => false)) {
    await introStep.getByRole('button', { name: /^continue$/i }).click();
  }

  const input = page.getByTestId('mobile-email-input').last();
  await input.waitFor({ state: 'visible', timeout: 15_000 });
  await input.focus();
}

test.describe('Public profile visual audit @smoke', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    mkdirSync(cycleDir, { recursive: true });
    writeFileSync(
      path.join(cycleDir, 'manifest.json'),
      JSON.stringify(
        {
          cycle: cycleName,
          generatedAt: new Date().toISOString(),
          cases: ACTIVE_PROFILE_CASES.flatMap(routeCase =>
            routeCase.shells.flatMap(shell =>
              ACTIVE_THEMES.flatMap(theme =>
                ACTIVE_BREAKPOINTS.map(breakpoint => ({
                  routeId: routeCase.id,
                  shell,
                  theme,
                  breakpoint: breakpoint.name,
                  captureState: routeCase.focusComposerInput
                    ? 'composer-focus'
                    : routeCase.composerVisible
                      ? 'composer'
                      : 'rest',
                  path: withShellVariant(routeCase.path, shell),
                }))
              )
            )
          ),
        },
        null,
        2
      )
    );
  });

  for (const routeCase of ACTIVE_PROFILE_CASES) {
    for (const shell of routeCase.shells) {
      for (const theme of ACTIVE_THEMES) {
        for (const breakpoint of ACTIVE_BREAKPOINTS) {
          const filename = screenshotName(
            shell,
            theme,
            breakpoint.name,
            routeCase.id
          );

          test(`${routeCase.id} · ${shell} · ${theme} · ${breakpoint.name}`, async ({
            page,
          }, testInfo) => {
            await blockAnalytics(page);
            await page.emulateMedia({ colorScheme: theme });
            await page.setViewportSize({
              width: breakpoint.width,
              height: breakpoint.height,
            });

            const targetPath = withShellVariant(routeCase.path, shell);
            await page.goto(targetPath, {
              waitUntil: 'domcontentloaded',
              timeout: 120_000,
            });

            await waitForHydration(page);
            await waitForVisibleSelector(page, routeCase.readySelector);
            if (routeCase.composerVisible) {
              await ensureComposerVisible(page);
            }
            if (routeCase.focusComposerInput) {
              await focusComposerInput(page);
            }

            await waitForImages(page);
            await waitForSettle(page);
            await hideTransientUi(page);
            await assertNoDevOverlays(page);

            const outputPath = testInfo.outputPath(filename);
            await page.screenshot({
              path: outputPath,
              fullPage: false,
            });

            copyFileSync(outputPath, path.join(cycleDir, filename));
            await testInfo.attach('profile-visual-case', {
              body: JSON.stringify(
                {
                  cycle: cycleName,
                  routeId: routeCase.id,
                  shell,
                  theme,
                  breakpoint: breakpoint.name,
                  captureState: routeCase.focusComposerInput
                    ? 'composer-focus'
                    : routeCase.composerVisible
                      ? 'composer'
                      : 'rest',
                  path: targetPath,
                  screenshot: filename,
                },
                null,
                2
              ),
              contentType: 'application/json',
            });
          });
        }
      }
    }
  }
});

test.describe('Public profile compact shell sizing', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('demo desktop shell stays materially below viewport height', async ({
    page,
  }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/demo/showcase/public-profile', {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await waitForHydration(page);
    await waitForVisibleSelector(
      page,
      '[data-testid="demo-showcase-public-profile"]'
    );
    await waitForImages(page);
    await waitForSettle(page);

    const shell = page.getByTestId('profile-compact-shell');
    await expect(shell).toBeVisible();

    const shellBox = await shell.boundingBox();
    expect(shellBox).not.toBeNull();

    if (!shellBox) {
      return;
    }

    // At 1280x900 with md:py-8, the compact card should sit well inside the
    // viewport instead of stretching close to full height again.
    expect(shellBox.height).toBeLessThan(780);
    expect(shellBox.y).toBeGreaterThanOrEqual(24);
    expect(shellBox.y + shellBox.height).toBeLessThanOrEqual(876);
  });
});
