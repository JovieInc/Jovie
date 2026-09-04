import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoDocumentOverflow } from './utils/mobile-overflow';
import { auditPublicProfileLayout } from './utils/public-profile-layout-invariant';
import {
  installPublicRouteMocks,
  runDspInteraction,
} from './utils/public-surface-helpers';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 390, height: 844 },
});

function intersectionArea(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
) {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x)
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y)
  );
  return width * height;
}

async function waitForSettledProfileLayout(
  page: import('@playwright/test').Page,
  expectedLayout: 'compact' | 'desktop'
) {
  const shell = page.getByTestId('public-profile-layout-shell');
  await expect(shell).toHaveAttribute('data-layout', expectedLayout);
  const visibleSurface = page.getByTestId(
    expectedLayout === 'desktop'
      ? 'profile-desktop-surface'
      : 'profile-compact-shell'
  );
  await expect(visibleSurface).toBeVisible();
  await expect(visibleSurface).toHaveAttribute(
    'data-interactive-ready',
    'true'
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
}

test.describe('public profile browser admission', () => {
  const responsiveCases = [
    { id: '1179-compact', width: 1179, height: 932, layout: 'compact' },
    { id: '1180-desktop', width: 1180, height: 932, layout: 'desktop' },
    { id: '1512-desktop', width: 1512, height: 932, layout: 'desktop' },
  ] as const;

  for (const fixture of responsiveCases) {
    test(`${fixture.id} enforces one responsive presentation`, async ({
      page,
    }) => {
      await installPublicRouteMocks(page);
      await page.setViewportSize({
        width: fixture.width,
        height: fixture.height,
      });
      const response = await page.goto(
        '/renders/profile-admission?layout=public',
        {
          waitUntil: 'domcontentloaded',
        }
      );
      expect(response?.status()).toBe(200);
      await waitForSettledProfileLayout(page, fixture.layout);

      const audit = await auditPublicProfileLayout(page);
      expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
      await expect(page.getByTestId('profile-compact-shell')).toHaveCount(
        fixture.layout === 'compact' ? 1 : 0
      );
      await expect(page.getByTestId('profile-desktop-surface')).toHaveCount(
        fixture.layout === 'desktop' ? 1 : 0
      );
      if (fixture.layout === 'desktop') {
        await expect(
          page.getByRole('button', { name: 'Alerts', exact: true })
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Get alerts' })
        ).toHaveCount(0);
      }
      if (fixture.id === '1512-desktop') {
        await page.getByRole('button', { name: 'Music', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Music', exact: true })
        ).toHaveAttribute('aria-current', 'page');
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await expect(page.getByTestId('profile-menu-drawer')).toBeVisible();
        await page.keyboard.press('Escape');
      }
    });
  }

  test('live resize transfers ownership exactly at 1180', async ({ page }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1179, height: 932 });
    await page.goto('/renders/profile-admission?layout=public', {
      waitUntil: 'domcontentloaded',
    });
    await waitForSettledProfileLayout(page, 'compact');

    await page.setViewportSize({ width: 1180, height: 932 });
    await waitForSettledProfileLayout(page, 'desktop');
    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);

    await page.setViewportSize({ width: 1179, height: 932 });
    await waitForSettledProfileLayout(page, 'compact');
    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);
  });

  test('desktop keeps the long-name Verify & Claim CTA coherent', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/renders/profile-admission?layout=public&name=long', {
      waitUntil: 'domcontentloaded',
    });
    await waitForSettledProfileLayout(page, 'desktop');

    const audit = await auditPublicProfileLayout(page);
    expect(audit.claimCtaLineCount).toBe(1);
    expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
    await expect(page.getByTestId('claim-banner-cta')).toHaveAccessibleName(
      'Verify & Claim for The Extraordinary Midnight Radio Orchestra'
    );
  });

  test('desktop-width compact preview is labeled and keyboard-exitable', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1280, height: 932 });
    await page.goto('/renders/profile-admission?layout=preview', {
      waitUntil: 'domcontentloaded',
    });
    await waitForSettledProfileLayout(page, 'compact');

    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);
    await expect(page.getByTestId('profile-preview-label')).toHaveText(
      'Preview'
    );
    const exit = page.getByTestId('profile-preview-exit');
    await exit.focus();
    await expect(exit).toBeFocused();
    await expect(exit).toHaveAttribute('href', '/unfazed');
  });

  test('deliberate red rejects the founder-reported desktop hybrid', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 932 });
    await page.goto(
      '/renders/profile-admission?violation=desktop-compact-shell',
      { waitUntil: 'domcontentloaded' }
    );
    await expect(
      page.getByTestId('public-profile-layout-shell')
    ).toHaveAttribute('data-interactive-ready', 'true');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
    });

    const audit = await auditPublicProfileLayout(page);
    const codes = new Set(audit.violations.map(violation => violation.code));
    expect(codes.has('desktop_bottom_nav')).toBe(true);
    expect(codes.has('desktop_compact_shell')).toBe(true);
    expect(codes.has('unlabeled_preview')).toBe(true);
    expect(codes.has('claim_cta_wrap') || codes.has('claim_cta_overflow')).toBe(
      true
    );
  });

  test('keeps consent, PAC, dock, and DSP actions operable', async ({
    page,
  }, testInfo) => {
    const runtimeErrors: string[] = [];
    const pacEvents: Array<{ event?: string }> = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (
        url.origin === new URL(page.url()).origin &&
        response.status() >= 500
      ) {
        runtimeErrors.push(response.status() + ' ' + url.pathname);
      }
    });

    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = function play() {
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function pause() {
        this.dispatchEvent(new Event('pause'));
      };
      if (!sessionStorage.getItem('profile-admission-initialized')) {
        localStorage.removeItem('jv_cc');
        localStorage.removeItem('jovie_tracking_consent');
        sessionStorage.setItem('profile-admission-initialized', '1');
      }
    });
    await page.setExtraHTTPHeaders({
      'x-vercel-ip-country': 'DE',
      'x-vercel-ip-country-region': 'BE',
    });
    await page.context().addCookies([
      {
        name: 'jv_cc_required',
        value: '1',
        url: process.env.BASE_URL ?? 'http://localhost:3100',
        sameSite: 'Lax',
      },
    ]);
    await page.route('**/api/profile/capture-dismissal**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          suppressed: false,
          sessionCount: 0,
          nextEligibleAt: null,
        }),
      })
    );
    await page.route('**/api/profile/pac-event', async route => {
      pacEvents.push(route.request().postDataJSON() as { event?: string });
      await route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/**', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/audio/profile-admission-preview.wav', route =>
      route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: Buffer.from(
          'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
          'base64'
        ),
      })
    );

    const response = await page.goto(
      '/renders/profile-admission?width=390&chrome=true',
      { waitUntil: 'domcontentloaded' }
    );
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/renders/profile-admission');

    const surface = page.getByTestId('marketing-render-surface');
    const pac = surface.getByTestId('profile-pac');
    const dock = surface.getByTestId('profile-tab-bar');
    const banner = page.getByTestId('cookie-banner');
    await expect(surface).toBeVisible();
    await expect(pac).toBeVisible();
    await expect(dock).toBeVisible();
    await expect(banner).toBeVisible();
    await expect(banner).toHaveClass(
      /cookie-banner-card--above-public-profile-dock/
    );

    const [bannerBox, dockBox] = await Promise.all([
      banner.boundingBox(),
      dock.boundingBox(),
    ]);
    expect(bannerBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(intersectionArea(bannerBox!, dockBox!)).toBe(0);

    const pacAction = pac.getByRole('link', { name: /Play Take Me Over/i });
    await expect(pacAction).toBeVisible();
    await pacAction.click();
    await expect
      .poll(() => pacEvents.some(event => event.event === 'pac_play_start'))
      .toBe(true);

    await banner.getByRole('button', { name: 'Reject all' }).click();
    await expect(banner).toBeHidden();
    await expect(pac).toBeVisible();
    const postRejectPacAction = pac.getByRole('link', {
      name: /Take Me Over/i,
    });
    await expect(postRejectPacAction).toBeVisible();
    await postRejectPacAction.click();
    await expect.poll(() => pacEvents.length).toBeGreaterThanOrEqual(2);

    await page.evaluate(() => {
      localStorage.removeItem('jv_cc');
      localStorage.removeItem('jovie_tracking_consent');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Accept all' }).click();
    await expect(banner).toBeHidden();
    await expect(pac).toBeVisible();
    const postAcceptPacAction = pac.getByRole('link', {
      name: /Take Me Over/i,
    });
    await expect(postAcceptPacAction).toBeVisible();
    await postAcceptPacAction.click();
    await expect.poll(() => pacEvents.length).toBeGreaterThanOrEqual(3);

    await expectNoDocumentOverflow(page, testInfo, 'profile admission mobile');
    await testInfo.attach('profile-admission-mobile.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="marketing-render-surface"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await page.goto(
      '/renders/profile-admission?width=390&chrome=true&mode=dsp',
      { waitUntil: 'domcontentloaded' }
    );
    await expect(surface).toBeVisible();
    await expect(page.getByTestId('profile-mode-drawer-listen')).toBeVisible();
    await expect(runDspInteraction(page)).resolves.toBe(true);
    expect(runtimeErrors).toEqual([]);
  });
});
