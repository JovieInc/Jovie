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

  test('adaptive profile exposes four moment-based modes without layout shift', async ({
    page,
  }) => {
    const adaptiveSection = page.getByTestId('artist-profile-section-adaptive');
    await adaptiveSection.scrollIntoViewIfNeeded();

    await expect(
      adaptiveSection.getByRole('heading', {
        name: 'One profile that adapts to every fan.',
      })
    ).toBeVisible();
    await expect(adaptiveSection.getByRole('tab')).toHaveCount(4);

    const initialHeight = await adaptiveSection.evaluate(
      element => element.getBoundingClientRect().height
    );
    const modes = [
      {
        label: 'Upcoming Release',
        headline: 'Before a drop, your profile becomes a countdown.',
        screenshotAlt:
          'Jovie artist profile showing an upcoming release and pre-save state.',
      },
      {
        label: 'Release Day',
        headline:
          'When the song is live, fans go straight to the right service.',
        screenshotAlt:
          'Jovie artist profile showing a release-day listen view.',
      },
      {
        label: 'Touring',
        headline: "When you're on the road, nearby dates come first.",
        screenshotAlt:
          'Jovie artist profile showing nearby shows and ticket paths.',
      },
      {
        label: 'Live Support',
        headline: 'At the merch table, one scan becomes support and capture.',
        screenshotAlt: 'Jovie artist profile showing direct support options.',
      },
    ] as const;

    for (const mode of modes) {
      const tab = adaptiveSection.getByRole('tab', { name: mode.label });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(
        adaptiveSection.getByText(mode.headline, { exact: true })
      ).toBeVisible();
      await expect(
        adaptiveSection.getByAltText(mode.screenshotAlt)
      ).toBeVisible();

      const selectedHeight = await adaptiveSection.evaluate(
        element => element.getBoundingClientRect().height
      );
      expect(Math.abs(selectedHeight - initialHeight)).toBeLessThanOrEqual(1);
    }
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

  test('five fan outcomes keep a stable rail across breakpoints', async ({
    page,
  }) => {
    await expectNoHorizontalOverflow(page);

    const outcomesSection = page.getByTestId('artist-profile-section-outcomes');
    const captureSection = page.getByTestId('artist-profile-section-capture');
    const grid = page.getByTestId('artist-profile-outcomes-grid');
    const scroller = page.getByTestId('artist-profile-outcomes-scroller');
    await outcomesSection.scrollIntoViewIfNeeded();

    await expect(grid).toBeVisible();
    await expect(scroller).toBeHidden();
    await expect(
      outcomesSection.getByTestId('artist-profile-outcome-card')
    ).toHaveCount(5);
    for (const title of [
      'Straight to listen',
      'Local dates first',
      'Support without friction',
      'Capture the fan',
      'Keep one link everywhere',
    ]) {
      await expect(
        outcomesSection.getByRole('heading', { name: title })
      ).toBeVisible();
    }
    await expect(outcomesSection.getByText('Tim White')).toHaveCount(2);
    await expect(outcomesSection.getByText('w/ Cosmic Gate')).toHaveCount(2);
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
    const outcomesTop = await outcomesSection.evaluate(
      element => element.getBoundingClientRect().top + window.scrollY
    );
    const captureTop = await captureSection.evaluate(
      element => element.getBoundingClientRect().top + window.scrollY
    );
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
      mobileOutcomesSection.getByTestId('artist-profile-outcome-card')
    ).toHaveCount(5);

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
