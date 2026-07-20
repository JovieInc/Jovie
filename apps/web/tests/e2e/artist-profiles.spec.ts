import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

async function interceptAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page
) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

async function getViewportHeight(page: import('@playwright/test').Page) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  return viewport?.height ?? 0;
}

async function getDocumentY(
  locator: import('@playwright/test').Locator
): Promise<number> {
  return locator.evaluate(
    el => window.scrollY + el.getBoundingClientRect().top
  );
}

async function scrollToY(page: import('@playwright/test').Page, top: number) {
  await page.evaluate(nextTop => {
    window.scrollTo({ top: nextTop, behavior: 'instant' });
  }, top);
  await page.waitForTimeout(180);
}

async function getClientRect(locator: import('@playwright/test').Locator) {
  return locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
    };
  });
}

const MODE_TRANSITION_SETTLE_MS = 400;
const GEOMETRY_TOLERANCE_PX = 1;
const ARTIST_PROFILE_MODE_LABELS = [
  'Upcoming Release',
  'Release Day',
  'Touring',
  'Live Support',
] as const;

interface GeometrySnapshot {
  readonly documentTop: number;
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

async function getGeometrySnapshot(
  locator: import('@playwright/test').Locator
): Promise<GeometrySnapshot> {
  return locator.evaluate(el => {
    const rect = el.getBoundingClientRect();

    return {
      documentTop: window.scrollY + rect.top,
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    };
  });
}

function expectStableGeometry(
  baseline: GeometrySnapshot,
  current: GeometrySnapshot,
  surface: string
) {
  for (const key of ['documentTop', 'height', 'width', 'x', 'y'] as const) {
    expect(
      Math.abs(current[key] - baseline[key]),
      `${surface} ${key} shifted`
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  }
}

async function expectFullyInViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator
) {
  const box = await locator.boundingBox();
  const viewportHeight = await getViewportHeight(page);

  expect(box).not.toBeNull();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    viewportHeight
  );
}

async function expectNotPartiallyVisible(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator
) {
  const box = await locator.boundingBox();
  if (!box) {
    return;
  }

  const viewportHeight = await getViewportHeight(page);
  const intersectsViewport = box.y < viewportHeight && box.y + box.height > 0;
  const fullyVisible = box.y >= 0 && box.y + box.height <= viewportHeight;

  expect(intersectsViewport && !fullyVisible).toBe(false);
}

test.describe('Artist Profiles Landing', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('hero renders with headline and CTAs', async ({ page }) => {
    const claimForm = page.getByTestId('homepage-claim-form');
    const claimButton = page.getByRole('button', {
      name: /claim your profile/i,
    });

    await expect(
      page.getByRole('heading', {
        name: /the link your music deserves\./i,
      })
    ).toBeVisible();
    await expect(claimButton).toBeVisible();
    await expect(page.getByLabel(/choose your handle/i)).toBeVisible();
    await expectFullyInViewport(page, claimForm);
    await expectFullyInViewport(page, claimButton);
  });

  test('final CTA renders with claim form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /claim your profile\./i })
    ).toBeVisible();
    await expect(
      page.getByTestId('final-cta-action').getByText(/claim your profile/i)
    ).toBeVisible();
  });

  test('hero stays intact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(
      page.getByRole('heading', {
        name: /the link your music deserves\./i,
      })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByRole('button', { name: /claim your profile/i })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expectFullyInViewport(page, page.getByTestId('homepage-claim-form'));
  });

  test('top story stays legible through the desktop hero-to-adaptive handoff', async ({
    page,
  }) => {
    const heroHeading = page.getByRole('heading', {
      name: /the link your music deserves\./i,
    });
    const claimForm = page.getByTestId('homepage-claim-form');
    const adaptiveHeading = page.getByRole('heading', { name: 'One profile.' });
    const adaptiveSubcaption = page.getByText('Adapts to every fan.');
    const adaptiveSection = page.getByTestId('artist-profile-section-adaptive');
    const trust = page.getByTestId('homepage-trust');
    const adaptivePhone = adaptiveSection.getByRole('img').first();
    const phone = page.getByAltText(
      "Jovie artist profile showing Tim White's live profile view."
    );

    await expect(heroHeading).toBeVisible();
    await expect(claimForm).toBeVisible();
    await expectFullyInViewport(page, claimForm);
    await expect(phone).toBeVisible();

    const adaptiveTop = await getDocumentY(adaptiveSection);
    await scrollToY(page, Math.max(0, adaptiveTop - 20));

    await expect(adaptiveHeading).toBeVisible();
    await expect(adaptiveSubcaption).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Upcoming Release' })
    ).toBeVisible();
    await expect(
      page.getByText('Before a drop, your profile becomes a countdown.')
    ).toBeVisible();
    await expectFullyInViewport(page, adaptivePhone);

    const trustRect = await getClientRect(trust);
    const viewportHeight = await getViewportHeight(page);
    expect(trustRect.top).toBeGreaterThanOrEqual(viewportHeight);

    const supportTab = page.getByRole('tab', { name: 'Live Support' });
    await expect(supportTab).toBeVisible();
    await supportTab.click();
    await expect(
      page.getByText(
        'At the merch table, one scan becomes support and capture.'
      )
    ).toBeVisible();
    await expect(
      page.getByAltText('Jovie artist profile showing direct support options.')
    ).toBeVisible();

    const trustTop = await getDocumentY(trust);
    await scrollToY(page, Math.max(0, trustTop - 220));
    await expect(trust).toBeVisible();

    const trustBoxDuringOverlay = await trust.boundingBox();
    const adaptivePhoneBoxDuringOverlay = await adaptivePhone.boundingBox();
    expect(trustBoxDuringOverlay).not.toBeNull();
    expect(adaptivePhoneBoxDuringOverlay).not.toBeNull();
    expect(trustBoxDuringOverlay?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      (adaptivePhoneBoxDuringOverlay?.y ?? 0) +
        (adaptivePhoneBoxDuringOverlay?.height ?? 0)
    );

    await scrollToY(page, Math.max(0, trustTop - 40));
    await expect(trust).toBeVisible();
    await expectNotPartiallyVisible(page, adaptivePhone);
  });

  test('top story stays legible on mobile without a clipped adaptive phone state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const heroHeading = page.getByRole('heading', {
      name: /the link your music deserves\./i,
    });
    const adaptiveHeading = page.getByRole('heading', { name: 'One profile.' });
    const adaptiveSection = page.getByTestId('artist-profile-section-adaptive');
    const trust = page.getByTestId('homepage-trust');
    const phone = page.getByAltText(
      "Jovie artist profile showing Tim White's live profile view."
    );

    await expect(heroHeading).toBeVisible();
    await expect(page.getByTestId('homepage-claim-form')).toBeVisible();
    await expectFullyInViewport(page, page.getByTestId('homepage-claim-form'));
    await expect(phone).toBeVisible();

    const adaptiveTop = await getDocumentY(adaptiveSection);
    await scrollToY(page, Math.max(0, adaptiveTop - 36));

    await expect(adaptiveHeading).toBeVisible();
    await expect(page.getByText('Adapts to every fan.')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Upcoming Release' })
    ).toBeVisible();
    await expectFullyInViewport(page, phone);

    const trustRect = await getClientRect(trust);
    const viewportHeight = await getViewportHeight(page);
    expect(trustRect.top).toBeGreaterThanOrEqual(viewportHeight);

    const trustTop = await getDocumentY(trust);
    await scrollToY(page, Math.max(0, trustTop - 80));
    await expect(trust).toBeVisible();
    await expectNotPartiallyVisible(page, phone);
  });

  test('adaptive mode changes preserve desktop and mobile geometry', async ({
    page,
  }) => {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 960 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      const adaptiveSection = page.getByTestId(
        'artist-profile-section-adaptive'
      );
      const trust = page.getByTestId('homepage-trust');
      const phone = adaptiveSection.getByRole('img').first();
      const tabList = adaptiveSection.getByRole('tablist', {
        name: 'Profile Modes',
      });
      const panelSlot = tabList.locator('xpath=following-sibling::*[1]');
      const upcomingRelease = adaptiveSection.getByRole('tab', {
        name: 'Upcoming Release',
      });

      await tabList.scrollIntoViewIfNeeded();
      await expect(phone).toBeVisible();
      await expect(tabList).toBeVisible();
      await expect(panelSlot).toBeVisible();
      await upcomingRelease.click();
      await expect(upcomingRelease).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);

      const baseline = {
        adaptive: await getGeometrySnapshot(adaptiveSection),
        panel: await getGeometrySnapshot(panelSlot),
        phone: await getGeometrySnapshot(phone),
        tabList: await getGeometrySnapshot(tabList),
        trust: await getGeometrySnapshot(trust),
      };

      for (const label of ARTIST_PROFILE_MODE_LABELS) {
        const tab = adaptiveSection.getByRole('tab', { name: label });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(MODE_TRANSITION_SETTLE_MS);

        await expectNoHorizontalOverflow(page);
        expectStableGeometry(
          baseline.adaptive,
          await getGeometrySnapshot(adaptiveSection),
          `${viewport.name} adaptive section`
        );
        expectStableGeometry(
          baseline.phone,
          await getGeometrySnapshot(phone),
          `${viewport.name} phone`
        );
        expectStableGeometry(
          baseline.tabList,
          await getGeometrySnapshot(tabList),
          `${viewport.name} tab list`
        );
        expectStableGeometry(
          baseline.panel,
          await getGeometrySnapshot(panelSlot),
          `${viewport.name} panel slot`
        );
        expectStableGeometry(
          baseline.trust,
          await getGeometrySnapshot(trust),
          `${viewport.name} trust section`
        );
      }

      await page.waitForTimeout(2500);
      await expect(
        adaptiveSection.getByRole('tab', { name: 'Live Support' })
      ).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('outcomes section comes right after the trust strip and keeps a stable grid across breakpoints', async ({
    page,
  }) => {
    await expectNoHorizontalOverflow(page);

    const trust = page.getByTestId('artist-profile-section-trust');
    const outcomesSection = page.getByTestId('artist-profile-section-outcomes');
    const captureSection = page.getByTestId('artist-profile-section-capture');
    const grid = page.getByTestId('artist-profile-outcomes-grid');
    const scroller = page.getByTestId('artist-profile-outcomes-scroller');
    await outcomesSection.scrollIntoViewIfNeeded();

    await expect(grid).toBeVisible();
    await expect(scroller).toBeHidden();
    await expect(
      outcomesSection.getByRole('heading', { name: /drive streams/i })
    ).toBeVisible();
    await expect(
      outcomesSection.getByRole('heading', { name: /sell out/i })
    ).toBeVisible();
    await expect(
      outcomesSection
        .getByTestId('artist-profile-drive-streams-live-card')
        .getByText('Tim White')
    ).toBeVisible();
    await expect(
      outcomesSection
        .getByTestId('artist-profile-drive-streams-live-card')
        .getByText('w/ Cosmic Gate')
    ).toBeVisible();
    await expect(
      outcomesSection.getByTestId('artist-profile-drive-streams-live-card')
    ).toBeVisible();
    await expect(
      outcomesSection.getByTestId('artist-profile-drive-streams-presave-card')
    ).toBeVisible();
    await expect(
      outcomesSection.getByTestId('artist-profile-sell-out-tour-card')
    ).toBeVisible();
    await expect(page.getByText('Wired to my latest release')).toHaveCount(0);
    const trustTop = await getDocumentY(trust);
    const outcomesTop = await getDocumentY(outcomesSection);
    const captureTop = await getDocumentY(captureSection);
    expect(outcomesTop).toBeGreaterThan(trustTop);
    expect(captureTop).toBeGreaterThan(outcomesTop);

    const startScrollY = await page.evaluate(() => window.scrollY);
    await grid.locator('article').first().hover();
    await page.mouse.wheel(0, 720);
    await page.waitForTimeout(180);
    const endScrollY = await page.evaluate(() => window.scrollY);
    expect(endScrollY).toBeGreaterThan(startScrollY);

    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const mobileOutcomesSection = page.getByTestId(
      'artist-profile-section-outcomes'
    );
    await mobileOutcomesSection.scrollIntoViewIfNeeded();
    const mobileGrid = page.getByTestId('artist-profile-outcomes-grid');
    const mobileScroller = page.getByTestId('artist-profile-outcomes-scroller');
    await expect(mobileGrid).toBeVisible();
    await expect(mobileScroller).toBeHidden();
    await expect(
      page.getByRole('heading', { name: /drive streams/i })
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test('spec wall renders the final eight cards without legacy philosophy copy', async ({
    page,
  }) => {
    const specWallSection = page.getByTestId(
      'artist-profile-section-spec-wall'
    );
    await specWallSection.scrollIntoViewIfNeeded();

    await expect(
      specWallSection.getByRole('heading', {
        name: 'Audience Quality Filtering',
      })
    ).toBeVisible();
    await expect(
      specWallSection.getByText(
        'Jovie identifies bots, your own team, and test traffic so your fan metrics measure actual fans.'
      )
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', {
        name: 'Rich Analytics',
      })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', { name: 'Geo Insights' })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', { name: 'Always in Sync' })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', { name: 'Activate Creators' })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', { name: 'Press-Ready Assets' })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', { name: 'UTM Builder' })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', { name: 'Blazing Fast' })
    ).toBeVisible();
    await expect(
      specWallSection.getByRole('heading', {
        name: 'Built for artists.',
      })
    ).toBeVisible();
    await expect(
      specWallSection.getByText(
        'The product truth behind one fast, music-native profile—kept compact on purpose.'
      )
    ).toBeVisible();
    await expect(
      specWallSection.getByText(
        'A slow profile kills conversions. Jovie is built to a much higher speed bar than a typical link-in-bio page.'
      )
    ).toBeVisible();
    await expect(specWallSection.getByText('Power features')).toHaveCount(0);
    await expect(specWallSection.getByText('Opinionated design')).toHaveCount(
      0
    );
    await expect(specWallSection.getByText('Product philosophy')).toHaveCount(
      0
    );
    await expect(specWallSection.getByText('Own your fan list')).toHaveCount(0);
    await expect(specWallSection.getByText('Retarget warm fans')).toHaveCount(
      0
    );
    await expect(specWallSection.getByText('Quality view')).toHaveCount(0);
    await expect(specWallSection.getByText('Low signal')).toHaveCount(0);
    await expect(specWallSection.getByText('Export-ready')).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
  });

  test('monetization carousel renders without overflow', async ({ page }) => {
    const section = page.getByTestId('artist-profile-section-monetization');
    await section.scrollIntoViewIfNeeded();

    const scroller = page.getByTestId('artist-profile-monetization-scroller');
    const firstCard = page
      .getByTestId('artist-profile-monetization-card')
      .first();

    await expect(
      section.getByRole('heading', { name: 'Get paid. Again and again.' })
    ).toBeVisible();
    await expect(scroller).toBeVisible();
    await expect(firstCard).toBeVisible();

    await scroller.evaluate(node => {
      node.scrollTo({ left: 320, behavior: 'instant' });
    });

    await expectNoHorizontalOverflow(page);
  });
});
