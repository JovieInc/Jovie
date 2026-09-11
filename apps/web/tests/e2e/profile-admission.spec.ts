import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { expectNoDocumentOverflow } from './utils/mobile-overflow';
import { observeProfileAdmissionFailure } from './utils/profile-admission-diagnostics.mjs';
import { auditPublicProfileLayout } from './utils/public-profile-layout-invariant';
import {
  installPublicRouteMocks,
  runDspInteraction,
} from './utils/public-surface-helpers';

const diagnostics = new WeakMap<object, () => Promise<void>>();

test.beforeEach(({ page }) => {
  diagnostics.set(page, observeProfileAdmissionFailure(page));
});

test.afterEach(async ({ page }) => {
  await diagnostics.get(page)?.();
  diagnostics.delete(page);
});

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

async function waitForSettledProfile(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const nextFrame = () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const readBoxes = () =>
      [
        '[data-testid="public-profile-layout-shell"]',
        '[data-testid="profile-compact-shell"]',
        '[data-testid="profile-desktop-shell"]',
        '[data-testid="claim-banner-cta"]',
      ].map(selector => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
      });

    await nextFrame();
    await nextFrame();
    let previous = JSON.stringify(readBoxes());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await nextFrame();
      const current = JSON.stringify(readBoxes());
      if (current === previous) return;
      previous = current;
    }
  });
}

async function captureStill(
  page: Page,
  testInfo: TestInfo,
  name: string,
  fullPage = false
) {
  const path = testInfo.outputPath(name);
  const body = await page.screenshot({ fullPage, path });
  await testInfo.attach(name, { contentType: 'image/png', path });
  return body;
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
  for (const viewport of [
    { width: 1179, layout: 'compact' as const },
    { width: 1180, layout: 'desktop' as const },
  ]) {
    test(`${viewport.width}px owns the expected public profile presentation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 932 });
      const response = await page.goto(
        '/renders/profile-admission?layout=public&state=unclaimed',
        { waitUntil: 'domcontentloaded' }
      );
      expect(response?.status()).toBe(200);

      const shell = page.getByTestId('public-profile-layout-shell');
      await expect(shell).toHaveAttribute('data-layout', viewport.layout);
      await expect(
        page.getByTestId(
          viewport.layout === 'desktop'
            ? 'profile-desktop-surface'
            : 'profile-compact-shell'
        )
      ).toBeVisible();
      await expect(
        page.getByTestId(
          viewport.layout === 'desktop'
            ? 'profile-desktop-surface'
            : 'profile-compact-shell'
        )
      ).toHaveAttribute('data-interactive-ready', 'true');

      await waitForSettledProfile(page);

      if (viewport.layout === 'desktop') {
        await expect(page.getByTestId('profile-compact-shell')).toHaveCount(0);
        await expect(page.getByTestId('profile-bottom-nav')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('profile-compact-shell')).toBeVisible();
        await expect(page.getByTestId('profile-bottom-nav')).toBeVisible();
      }

      const audit = await auditPublicProfileLayout(page);
      expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
    });
  }

  for (const viewport of [
    { width: 1179, layout: 'compact' as const },
    { width: 1180, layout: 'desktop' as const },
    { width: 1512, layout: 'desktop' as const },
  ]) {
    test(`${viewport.width}px canonical /unfazed owns its presentation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 932 });
      await installPublicRouteMocks(page);
      const response = await page.goto('/unfazed', {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);

      const shell = page.getByTestId('public-profile-layout-shell');
      await expect(shell).toHaveAttribute('data-layout', viewport.layout);
      const readySurface = page.getByTestId(
        viewport.layout === 'desktop'
          ? 'profile-desktop-surface'
          : 'profile-compact-shell'
      );
      await expect(readySurface).toBeVisible();
      await expect(readySurface).toHaveAttribute(
        'data-interactive-ready',
        'true'
      );
      await waitForSettledProfile(page);

      if (viewport.layout === 'desktop') {
        await expect(page.getByTestId('profile-compact-shell')).toHaveCount(0);
        await expect(page.getByTestId('profile-bottom-nav')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('profile-compact-shell')).toBeVisible();
        await expect(page.getByTestId('profile-bottom-nav')).toBeVisible();
      }

      const audit = await auditPublicProfileLayout(page);
      expect(audit.claimCtaLineCount).toBe(1);
      expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
    });
  }

  test('1512px public route blocks the founder-reported compact desktop hybrid', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1512, height: 932 });
    const response = await page.goto(
      '/renders/profile-admission?layout=public&state=unclaimed',
      { waitUntil: 'domcontentloaded' }
    );
    expect(response?.status()).toBe(200);

    const shell = page.getByTestId('public-profile-layout-shell');
    const desktop = page.getByTestId('profile-desktop-surface');
    await expect(shell).toHaveAttribute('data-layout', 'desktop');
    await expect(desktop).toBeVisible();
    await expect(desktop).toHaveAttribute('data-interactive-ready', 'true');
    await waitForSettledProfile(page);

    const desktopGeometry = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>(
        '.public-profile-layout-frame'
      );
      const contentMax = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--ds-public-content-max'
        )
      );
      return {
        actualWidth: frame?.getBoundingClientRect().width ?? null,
        expectedWidth: Math.min(window.innerWidth, contentMax),
      };
    });
    expect(desktopGeometry.actualWidth).not.toBeNull();
    expect(
      Math.abs(desktopGeometry.actualWidth! - desktopGeometry.expectedWidth)
    ).toBeLessThanOrEqual(1);

    const audit = await auditPublicProfileLayout(page);
    expect(audit.claimCtaLineCount).toBe(1);
    expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
    await expect(page.getByTestId('profile-compact-shell')).toHaveCount(0);
    await expect(page.getByTestId('profile-bottom-nav')).toHaveCount(0);
    await testInfo.attach('public-profile-desktop-1512.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });

  test('1512px long-name claim CTA remains one line', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 932 });
    const response = await page.goto(
      '/renders/profile-admission?layout=public&state=unclaimed&name=long',
      { waitUntil: 'domcontentloaded' }
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('profile-desktop-surface')).toBeVisible();
    await expect(page.getByTestId('profile-desktop-surface')).toHaveAttribute(
      'data-interactive-ready',
      'true'
    );
    await waitForSettledProfile(page);

    const audit = await auditPublicProfileLayout(page);
    expect(audit.claimCtaLineCount).toBe(1);
    expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);

    const claimCta = page.getByTestId('claim-banner-cta');
    await expect(claimCta).toHaveAccessibleName(
      'Verify & Claim for The Extraordinary Midnight Radio Orchestra'
    );
    const claimGeometry = await claimCta.evaluate(element => {
      const label = element.querySelector<HTMLElement>(
        '[data-testid="claim-banner-cta-label"]'
      );
      const icon = element.querySelector<SVGElement>('svg');
      if (!label || !icon) return null;
      const ctaBox = element.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      return {
        ctaWidth: ctaBox.width,
        ctaHeight: ctaBox.height,
        labelCenter: labelBox.top + labelBox.height / 2,
        iconCenter: iconBox.top + iconBox.height / 2,
      };
    });
    expect(claimGeometry).not.toBeNull();
    expect(claimGeometry!.ctaWidth).toBeGreaterThanOrEqual(44);
    expect(claimGeometry!.ctaHeight).toBeGreaterThanOrEqual(44);
    expect(
      Math.abs(claimGeometry!.labelCenter - claimGeometry!.iconCenter)
    ).toBeLessThanOrEqual(2);
  });

  const responsiveCases = [
    { id: '1179-compact', width: 1179, height: 932, layout: 'compact' },
    { id: '1180-desktop', width: 1180, height: 932, layout: 'desktop' },
    { id: '1512-desktop', width: 1512, height: 982, layout: 'desktop' },
  ] as const;

  for (const fixture of responsiveCases) {
    test(`${fixture.id} enforces one responsive presentation`, async ({
      page,
    }, testInfo) => {
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
      await captureStill(page, testInfo, `${fixture.id}.png`);
      if (fixture.id === '1512-desktop') {
        const music = page.getByRole('button', { name: 'Music', exact: true });
        await music.click();
        await expect(music).toHaveAttribute('aria-current', 'page');
        const menu = page.getByRole('button', { name: 'Menu', exact: true });
        await menu.click();
        await expect(page.getByTestId('profile-menu-drawer')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('profile-menu-drawer')).toBeHidden();
        await expect(menu).toBeFocused();
      }
    });
  }

  for (const state of ['unclaimed', 'claimed', 'owner'] as const) {
    for (const width of [1179, 1180, 1512]) {
      test(`${state} ${width}px renders only actual banner space`, async ({
        page,
      }, testInfo) => {
        const hydrationErrors: string[] = [];
        page.on('pageerror', error => hydrationErrors.push(error.message));
        page.on('console', message => {
          if (
            message.type() === 'error' &&
            /hydrat|did not match|server rendered/i.test(message.text())
          )
            hydrationErrors.push(message.text());
        });
        await installPublicRouteMocks(page);
        await page.setViewportSize({
          width,
          height: width === 1512 ? 982 : 932,
        });
        await page.goto(
          `/renders/profile-admission?layout=public&state=${state}`
        );
        await waitForSettledProfileLayout(
          page,
          width < 1180 ? 'compact' : 'desktop'
        );
        const wrappers = page.locator(
          '[data-testid="profile-desktop-banner"]:visible, [data-testid="profile-shell-banner"]:visible'
        );
        await expect(wrappers).toHaveCount(state === 'unclaimed' ? 1 : 0);
        expect((await auditPublicProfileLayout(page)).violations).toEqual([]);
        expect(hydrationErrors).toEqual([]);
        if (state === 'claimed' && width === 1512) {
          await captureStill(page, testInfo, 'claimed-desktop-1512x982.png');
        }
      });
    }
  }

  test('deliberate red detects phantom banner reservation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 932 });
    await page.goto('/renders/profile-admission?violation=phantom-banner');
    const audit = await auditPublicProfileLayout(page);
    expect(audit.violations.map(violation => violation.code)).toContain(
      'phantom_banner'
    );
  });

  test('deliberate red detects reserved space without a rendered banner', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1512, height: 932 });
    await page.goto('/renders/profile-admission?layout=public&state=claimed');
    await waitForSettledProfileLayout(page, 'desktop');
    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);
    await page.getByTestId('profile-desktop-surface').evaluate(surface => {
      surface.style.marginTop = '68px';
    });
    const audit = await auditPublicProfileLayout(page);
    expect(audit.violations.map(violation => violation.code)).toContain(
      'banner_reserved_geometry'
    );
  });

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

  test('deliberate red detects a desktop artist name escaping its cover', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/renders/profile-admission?layout=public&name=long', {
      waitUntil: 'domcontentloaded',
    });
    await waitForSettledProfileLayout(page, 'desktop');
    expect((await auditPublicProfileLayout(page)).violations).toEqual([]);

    await page.getByTestId('profile-header').evaluate(header => {
      header.style.width = '200%';
      header.style.maxWidth = 'none';
    });
    expect(
      (await auditPublicProfileLayout(page)).violations.map(
        violation => violation.code
      )
    ).toContain('artist_name_clipped');
  });

  test('captures the founder 3024x1964 retina state without a compact desktop shell', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      deviceScaleFactor: 2,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1512, height: 982 },
    });
    try {
      const page = await context.newPage();
      await installPublicRouteMocks(page);
      const response = await page.goto(
        '/renders/profile-admission?layout=public&state=unclaimed&name=long',
        { waitUntil: 'domcontentloaded' }
      );
      expect(response?.status()).toBe(200);
      await waitForSettledProfileLayout(page, 'desktop');

      const audit = await auditPublicProfileLayout(page);
      expect(audit.claimCtaLineCount).toBe(1);
      expect(audit.violations, JSON.stringify(audit, null, 2)).toEqual([]);
      const still = await captureStill(
        page,
        testInfo,
        'public-profile-founder-retina-3024x1964.png'
      );
      expect(still.readUInt32BE(16)).toBe(3024);
      expect(still.readUInt32BE(20)).toBe(1964);
    } finally {
      await context.close();
    }
  });

  test('desktop-width compact preview is labeled and keyboard-exitable', async ({
    page,
  }, testInfo) => {
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
    await captureStill(page, testInfo, 'labeled-desktop-profile-preview.png');
  });

  test('deliberate red rejects the narrow desktop card, bottom nav, and wrapped claim CTA', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 932 });
    const response = await page.goto(
      '/renders/profile-admission?violation=desktop-compact-shell',
      { waitUntil: 'domcontentloaded' }
    );
    expect(response?.status()).toBe(200);

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

    await installPublicRouteMocks(page);

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
    await captureStill(page, testInfo, 'profile-admission-mobile.png', true);
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
