import { type Page, type Route } from '@playwright/test';
import { profileModes } from '@/features/profile/registry';
import { expect, test } from './setup';
import {
  checkElementVisibility,
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Public Profile E2E Tests (consolidated from profile.public, artist-profile, smoke-public-profile-modes)
 *
 * Covers:
 * 1. Profile rendering: name, avatar, links, footer, meta/SEO
 * 2. Profile modes: listen, tip, subscribe, about (all breakpoints)
 * 3. Mobile drawer interactions
 * 4. Deep link routing
 * 5. 404 handling for non-existent profiles
 * 6. Admin profile (/tim) never returns 404
 * 7. Accessibility: heading structure, button labels, link labels
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  process.env.E2E_FAST_ITERATION === '1',
  'Public profile matrix coverage runs in the slower public-profile lane'
);

const hasDatabase = !!(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);

const runProfileTests = process.env.E2E_ARTIST_PROFILE === '1' || hasDatabase;
const describeProfile = runProfileTests ? test.describe : test.describe.skip;

test.describe.configure({ mode: 'serial' });

async function interceptAnalytics(page: Page) {
  await page.route('**/api/profile/view', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
}

function isUnavailablePage(text: string): boolean {
  const body = text.toLowerCase();
  return (
    body.includes('profile not found') ||
    body.includes('temporarily unavailable') ||
    body.includes('loading jovie profile')
  );
}

function artistNameLocator(page: Page) {
  return page.getByText('Dua Lipa', { exact: true }).first();
}

async function assertProfilePageHealthy(page: Page) {
  const bodyText =
    (await page
      .locator('body')
      .textContent()
      .catch(() => '')) ?? '';
  expect(
    bodyText.toLowerCase().includes('application error') ||
      bodyText.toLowerCase().includes('internal server error') ||
      bodyText.toLowerCase().includes('unhandled runtime error'),
    'Public profile rendered an error boundary page'
  ).toBe(false);
  return bodyText;
}

// ============================================================================
// Core Profile Rendering
// ============================================================================

describeProfile('Profile - Core Rendering', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/dualipa', {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });

    const h1Visible = await page
      .locator('h1')
      .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
      .catch(() => false);
    if (!h1Visible) {
      test.skip(true, '/dualipa profile not loaded');
    }
  });

  test('displays artist name, subtitle, and avatar', async ({ page }) => {
    await expect(artistNameLocator(page)).toBeVisible();
    await expect(page.getByText(/Pop artist|Artist/).first()).toBeVisible();

    // Avatar
    const artistImage = page
      .locator('[role="img"][aria-label="Dua Lipa"]')
      .or(page.locator('img[alt="Dua Lipa"]'));
    const imageVisible = await checkElementVisibility(artistImage, {
      skipMessage: 'Artist image not visible (CDN image may be stale)',
    });
    if (imageVisible) {
      await expect(artistImage.first()).toBeVisible();
    }
  });

  test('shows music or social links', async ({ page }) => {
    const socialButtons = page.locator('button[title*="Follow"]');
    const musicLinks = page.locator(
      'a[href*="spotify"], a[href*="apple"], button:has-text("Listen"), a:has-text("Listen")'
    );
    const anyLink = socialButtons.first().or(musicLinks.first());

    const hasLinks = await anyLink
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (!hasLinks) {
      test.skip(true, 'No social or music links on dualipa profile');
    }
    await expect(anyLink).toBeVisible();
  });

  test('has Jovie footer branding', async ({ page }) => {
    const footerLink = page.getByRole('link', { name: /Jovie home/i });
    await expect(footerLink.first()).toBeVisible({ timeout: 10000 });
  });

  test('has proper meta tags and SEO', async ({ page }) => {
    await expect(page).toHaveTitle(/Dua Lipa/);

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /.+/);

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute('content', /.+/);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /.+/);

    // Structured data
    const structuredData = page.locator('script[type="application/ld+json"]');
    const count = await structuredData.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(artistNameLocator(page)).toBeVisible();
    await expect(page.getByText(/Pop artist|Artist/).first()).toBeVisible();
  });

  test('has proper heading structure with single h1', async ({ page }) => {
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    await expect(artistNameLocator(page)).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
  });
});

// ============================================================================
// Profile 404 Handling
// ============================================================================

describeProfile('Profile - 404 Page', () => {
  test.setTimeout(180_000);

  test('shows 404 with navigation for non-existent profile', async ({
    page,
  }) => {
    await page.goto('/nonexistent-artist', {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });

    const h1 = page.locator('h1');
    const isH1Visible = await h1
      .isVisible({ timeout: 30_000 })
      .catch(() => false);
    if (!isH1Visible) {
      test.skip(true, '404 page stuck in loading skeleton');
    }

    await expect(h1).toContainText('Profile not found');
    await expect(page.getByText(/doesn.t exist/)).toBeVisible();

    const goHome = page.getByRole('link', { name: 'Go home' });
    await expect(goHome).toBeVisible();

    // Click Go home and verify navigation
    await goHome.click();
    await expect(page).toHaveURL('/');
  });

  test('404 page has noindex meta tag', async ({ page }) => {
    await page.goto('/nonexistent-artist', {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });

    const h1 = page.locator('h1');
    const isH1Visible = await h1
      .isVisible({ timeout: 30_000 })
      .catch(() => false);
    if (!isH1Visible) {
      test.skip(true, '404 page not rendered');
    }

    const robots = page.locator('meta[name="robots"]');
    const count = await robots.count();
    expect(count).toBeGreaterThanOrEqual(1);

    let hasNoIndex = false;
    for (let i = 0; i < count; i++) {
      const content = await robots.nth(i).getAttribute('content');
      if (content?.includes('noindex')) {
        hasNoIndex = true;
        break;
      }
    }
    expect(hasNoIndex).toBe(true);
  });
});

// ============================================================================
// Admin Profile
// ============================================================================

describeProfile('Profile - Admin (/tim)', () => {
  test.setTimeout(180_000);

  test('admin profile never returns 404 and renders content', async ({
    page,
  }) => {
    const response = await page.goto('/tim', {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).not.toBe(404);

    const h1 = page.locator('h1');
    const isH1Visible = await h1
      .isVisible({ timeout: 30_000 })
      .catch(() => false);
    if (!isH1Visible) {
      console.log('!! /tim profile h1 not visible -- may not exist in DB');
      test.skip();
    }
    await expect(h1).toBeVisible();
  });
});

// ============================================================================
// Profile Modes x Breakpoints
// ============================================================================

const PROFILE_MODES = profileModes
  .filter(mode => mode !== 'contact' && mode !== 'tour')
  .map(mode => ({
    mode,
    query: mode === 'profile' ? '' : `?mode=${mode}`,
  })) as ReadonlyArray<{
  mode: (typeof profileModes)[number];
  query: string;
}>;

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

test.describe('Profile Modes @smoke @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('mode x breakpoint coverage', () => {
    for (const breakpoint of BREAKPOINTS) {
      for (const profileMode of PROFILE_MODES) {
        test(`${profileMode.mode} mode renders at ${breakpoint.name}`, async ({
          page,
        }) => {
          await interceptAnalytics(page);
          await page.setViewportSize({
            width: breakpoint.width,
            height: breakpoint.height,
          });

          const route = `/${TEST_PROFILES.DUALIPA}${profileMode.query}`;
          const response = await smokeNavigate(page, route);
          expect(response?.status() ?? 0).toBeLessThan(500);

          await waitForHydration(page);
          const bodyText = await assertProfilePageHealthy(page);

          if (isUnavailablePage(bodyText)) {
            test.skip(true, 'Profile unavailable in this environment');
            return;
          }

          await expect(artistNameLocator(page)).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });

          if (profileMode.mode === 'profile') {
            await expect(page).toHaveURL(
              new RegExp(`/${TEST_PROFILES.DUALIPA}$`)
            );
          } else {
            await expect(page).toHaveURL(
              new RegExp(`/${TEST_PROFILES.DUALIPA}\\?mode=${profileMode.mode}`)
            );
          }
        });
      }
    }
  });

  test.describe('mobile drawer coverage', () => {
    for (const profileMode of PROFILE_MODES) {
      test(`${profileMode.mode} mode can open drawers on mobile`, async ({
        page,
      }, testInfo) => {
        await interceptAnalytics(page);
        await page.setViewportSize({ width: 375, height: 812 });

        const route = `/${TEST_PROFILES.DUALIPA}${profileMode.query}`;
        const response = await smokeNavigate(page, route);
        expect(response?.status() ?? 0).toBeLessThan(500);

        await waitForHydration(page);
        const bodyText = await assertProfilePageHealthy(page);
        if (isUnavailablePage(bodyText)) {
          test.skip(true, 'Profile unavailable');
          return;
        }

        const drawerChecks = [
          {
            selector: page.getByRole('button', { name: 'Listen now' }).first(),
            openedText: /listen on/i,
            closeSelector: page.getByRole('button', { name: 'Close' }).first(),
          },
          {
            selector: page.locator('[data-testid="pay-trigger"]').first(),
            openedText: /support\s+dua lipa/i,
            closeSelector: page.getByRole('button', { name: 'Close' }).first(),
          },
          {
            selector: page.locator('[data-testid="contacts-trigger"]').first(),
            openedText: /contact dua lipa/i,
            closeSelector: null,
          },
        ] as const;

        const openedDrawers: string[] = [];
        for (const drawer of drawerChecks) {
          if (!(await drawer.selector.isVisible().catch(() => false))) continue;

          await drawer.selector.click();
          await expect(page.getByText(drawer.openedText)).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
          openedDrawers.push(String(drawer.openedText));

          if (
            drawer.closeSelector &&
            (await drawer.closeSelector.isVisible().catch(() => false))
          ) {
            await drawer.closeSelector.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForLoadState('domcontentloaded');
        }

        await testInfo.attach('opened-drawers', {
          body: JSON.stringify(
            { mode: profileMode.mode, openedDrawers },
            null,
            2
          ),
          contentType: 'application/json',
        });
      });
    }
  });

  test.describe('deep link routing', () => {
    const deepLinks = [
      { mode: 'listen', path: 'listen' },
      { mode: 'tip', path: 'tip' },
      { mode: 'subscribe', path: 'subscribe' },
      { mode: 'about', path: 'about' },
      { mode: 'contact', path: 'contact' },
      { mode: 'tour', path: 'tour' },
    ] as const;

    for (const deepLink of deepLinks) {
      test(`${deepLink.path} deep link resolves to ${deepLink.mode} mode`, async ({
        page,
      }) => {
        await interceptAnalytics(page);

        const response = await smokeNavigate(
          page,
          `/${TEST_PROFILES.DUALIPA}/${deepLink.path}`
        );
        expect(response?.status() ?? 0).toBeLessThan(500);

        await waitForHydration(page);
        const bodyText = await assertProfilePageHealthy(page);
        if (isUnavailablePage(bodyText)) {
          test.skip(true, 'Profile unavailable');
          return;
        }

        await expect(page).toHaveURL(
          new RegExp(`/${TEST_PROFILES.DUALIPA}\\?mode=${deepLink.mode}`)
        );
      });
    }
  });

  test('notifications route renders subscription UI for a seeded profile', async ({
    page,
  }) => {
    await interceptAnalytics(page);

    const handle = process.env.E2E_NOTIFICATIONS_PROFILE || 'testartist';
    const response = await smokeNavigate(page, `/${handle}/notifications`);
    expect(response?.status() ?? 0).toBeLessThan(500);

    await waitForHydration(page);
    const bodyText = await assertProfilePageHealthy(page);
    if (isUnavailablePage(bodyText)) {
      test.skip(true, 'Notifications profile unavailable');
      return;
    }

    const notificationsUi = page
      .getByRole('button', {
        name: /turn on notifications|notify me about new releases/i,
      })
      .or(page.getByRole('button', { name: /get notified/i }))
      .or(page.locator('input[type="email"], input[type="tel"]').first());
    await expect(
      notificationsUi.first(),
      'Notifications route did not render a subscription CTA'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  test('shop route falls back gracefully when no shop is configured', async ({
    page,
  }) => {
    await interceptAnalytics(page);

    const handle = process.env.E2E_SHOP_PROFILE || TEST_PROFILES.DUALIPA;
    const response = await smokeNavigate(page, `/${handle}/shop`);
    expect(response?.status() ?? 0).toBeLessThan(500);

    await page.waitForURL(new RegExp(`/${handle}(?:$|\\?)`), {
      timeout: SMOKE_TIMEOUTS.URL_STABLE,
      waitUntil: 'domcontentloaded',
    });
    await waitForHydration(page);
    const bodyText = await assertProfilePageHealthy(page);
    if (isUnavailablePage(bodyText)) {
      test.skip(true, 'Shop profile unavailable');
      return;
    }

    await expect(page.locator('h1').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
