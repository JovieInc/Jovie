import { copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  resetOwnedOutputDirectory,
  resolveOwnedOutputDirectory,
} from '../../scripts/owned-output-path';
import { expect, test } from './setup';
import {
  BREAKPOINTS,
  type BreakpointConfig,
  type BreakpointVariant,
  FAST_ITERATION,
  PROFILE_CASES,
  PROFILE_READY_SELECTOR,
  type ProfileAuditCase,
  type ShellVariant,
  TEST_PROFILE,
  THEMES,
  type ThemeVariant,
} from './utils/profile-visual-audit-cases';
import { waitForHydration } from './utils/smoke-test-utils';

const FAST_ITERATION_CASE_IDS = new Set<ProfileAuditCase['id']>([
  // Fast-feedback smoke keeps the historically flaky deep-link and drawer paths.
  // Base profile/listen coverage already lives in lighter public smoke specs.
  'subscribe',
  'subscribe-focus',
  'contact',
  'tip',
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
const EXPECTED_AUDIT_CAPTURE_COUNT = ACTIVE_PROFILE_CASES.reduce(
  (total, routeCase) =>
    total +
    routeCase.shells.length * ACTIVE_THEMES.length * ACTIVE_BREAKPOINTS.length,
  0
);
let completedAuditCaptureCount = 0;

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
const cycleDir = resolveOwnedOutputDirectory(
  path.join(REPO_ROOT, '.context/profile-audit'),
  cycleName,
  'PROFILE_AUDIT_CYCLE'
);

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
    '[data-testid="profile-mobile-notifications-step-preferences"]',
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
      try {
        await trigger.click();
      } catch {
        if (await hasVisibleComposer()) {
          return;
        }
        throw new Error('Failed to reveal the notifications composer');
      }
      break;
    }
  }

  if (await hasVisibleComposer()) {
    return;
  }

  await waitForVisibleSelector(
    page,
    '[data-testid="profile-mobile-notifications-flow"], [data-testid="profile-mobile-notifications-step-preferences"], [data-testid="profile-mobile-notifications-step-email"]'
  );
}

async function focusComposerInput(page: import('@playwright/test').Page) {
  const preferencesStep = page
    .getByTestId('profile-mobile-notifications-step-preferences')
    .last();
  if (await preferencesStep.isVisible().catch(() => false)) {
    await preferencesStep.getByRole('switch', { name: /new music/i }).click();
  }

  const input = page.getByTestId('mobile-email-input').last();
  await input.waitFor({ state: 'visible', timeout: 15_000 });
  await input.focus();
}

test.describe('Public profile visual audit @smoke', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    await resetOwnedOutputDirectory(
      path.dirname(cycleDir),
      path.basename(cycleDir),
      'PROFILE_AUDIT_CYCLE'
    );
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
                  path: routeCase.path,
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

  test.afterAll(() => {
    if (completedAuditCaptureCount !== EXPECTED_AUDIT_CAPTURE_COUNT) return;
    writeFileSync(
      path.join(cycleDir, 'complete.json'),
      `${JSON.stringify({
        completedAt: new Date().toISOString(),
        captureCount: completedAuditCaptureCount,
      })}\n`
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

            const targetPath = routeCase.path;
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

            expect(outputPath).toBeTruthy();
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
            completedAuditCaptureCount += 1;
          });
        }
      }
    }
  }
});

test.describe('Public profile compact shell sizing', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('desktop shell stays materially below viewport height', async ({
    page,
  }) => {
    await blockAnalytics(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1280, height: 900 });

    // The seeded real profile, not /demo/showcase: /demo is production-blocked
    // (JOV-7606), and this lane runs against a production build.
    await page.goto(`/${TEST_PROFILE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    await waitForHydration(page);
    await waitForVisibleSelector(page, PROFILE_READY_SELECTOR);
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

// JOV-8629 §6.2: the profile document is ISR-cached behind the proxy's
// per-request publication gate. A published handle renders its header; an
// unknown handle never renders a profile body.
test.describe('profile publication gate', () => {
  test('renders a published handle and refuses an unknown one', async ({
    page,
  }) => {
    const published = await page.goto(`/${TEST_PROFILE}`);
    expect(published?.status()).toBe(200);
    await expect(page.locator(PROFILE_READY_SELECTOR).first()).toBeVisible();

    const unknown = await page.request.get('/zz-no-such-artist-e2e-gate');
    expect(unknown.status()).toBe(404);
    expect(await unknown.text()).not.toContain('profile-compact-shell');
  });

  // JOV-12153: the unknown-handle 404 head carries exactly ONE robots meta
  // containing "noindex" — Next's automatic NonIndex noindex for status > 400
  // renders. Explicit robots on 404 metadata used to emit a second tag and
  // fail the synthetic smoke's noindex-count-1 assertion.
  test('unknown-handle 404 serves exactly one noindex robots meta', async ({
    page,
  }) => {
    const unknown = await page.request.get('/zz-no-such-artist-e2e-gate');
    expect(unknown.status()).toBe(404);
    const html = await unknown.text();
    const robotsMetas = [...html.matchAll(/<meta\s+name="robots"[^>]*>/gi)].map(
      match => match[0]
    );
    expect(
      robotsMetas.filter(meta => /content="[^"]*noindex/.test(meta))
    ).toHaveLength(1);
  });

  // JOV-12081: the unknown-handle 404 must be server-rendered. The miss
  // rewrite used to target the prerendered profile-mode-render route, where
  // notFound() during the ISR fallback render served Next's flight-only
  // `__next_error__` shell — no rendered body, no robots meta — so axe, the
  // overflow guard and the visual audit all timed out waiting for the branded
  // boundary. The dynamic profile-miss route renders it in the first HTML.
  test('unknown-handle 404 renders the branded boundary in the SSR HTML', async ({
    page,
  }) => {
    const unknown = await page.request.get('/zz-no-such-artist-e2e-gate');
    expect(unknown.status()).toBe(404);
    const html = await unknown.text();
    expect(html).not.toContain('__next_error__');
    expect(html).toContain('data-testid="not-found"');
    expect(html).not.toContain('profile-compact-shell');
  });

  // JOV-12081: `?mode=` must survive the prerendered profile route. The
  // rewrite used to sit in afterFiles, which never wins over a prerendered
  // route, so ?mode=listen silently rendered the home document and the DSP
  // audit exercised only the home's Spotify CTA.
  test('?mode=listen renders the listen surface in the SSR HTML', async ({
    page,
  }) => {
    const response = await page.request.get(`/${TEST_PROFILE}?mode=listen`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-profile-mode="listen"');
  });
});

// JOV-10246: the release artwork (profile LCP element) is server-rendered
// markup with a high fetch priority, so it can paint before hydration.
test.describe('profile LCP artwork', () => {
  test('ships the artwork in the first HTML', async ({ page }) => {
    const response = await page.request.get(`/${TEST_PROFILE}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<img[^>]*fetchPriority="high"/i);
  });
});

// The latest-release credits now load in the same batch as the other profile
// reads instead of after them. The document must still arrive whole: status
// 200 with the artwork in the first HTML, for visits that overlap.
test.describe('profile batched reads', () => {
  test('serves the whole profile document to overlapping visits', async ({
    page,
  }) => {
    const responses = await Promise.all([
      page.request.get(`/${TEST_PROFILE}`),
      page.request.get(`/${TEST_PROFILE}`),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toMatch(/<img[^>]*fetchPriority="high"/i);
    }
  });
});
