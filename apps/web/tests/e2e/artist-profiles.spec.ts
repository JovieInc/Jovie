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

    await page.getByLabel(/choose your handle/i).fill('@river-signal');
    await page.route('**/start?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Claim profile</title>',
      })
    );
    await Promise.all([
      page.waitForURL(url => {
        return (
          url.pathname === '/start' &&
          url.searchParams.get('handle') === 'river-signal' &&
          url.searchParams
            .get('starter_prompt')
            ?.includes('jov.ie/river-signal') === true
        );
      }),
      claimButton.click(),
    ]);
  });

  test('final CTA renders with claim form', async ({ page }) => {
    const finalCta = page.getByTestId('artist-profile-section-final-cta');
    await expect(
      finalCta.getByRole('heading', {
        name: 'Claim your profile.',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('final-cta-action').getByText(/claim your profile/i)
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-action')).toHaveAttribute(
      'href',
      '/signup'
    );
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
      }

      await page.waitForTimeout(2500);
      await expect(
        adaptiveSection.getByRole('tab', { name: 'Live Support' })
      ).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('canonical sections render in order and proof remains gated', async ({
    page,
  }) => {
    const sectionIds = [
      'artist-profile-section-hero',
      'artist-profile-section-adaptive',
      'artist-profile-section-outcomes',
      'artist-profile-section-capture',
      'artist-profile-section-opinionated',
      'artist-profile-section-spec-wall',
      'artist-profile-section-how-it-works',
      'artist-profile-section-faq',
      'artist-profile-section-final-cta',
    ];

    for (const sectionId of sectionIds) {
      await expect(page.getByTestId(sectionId)).toHaveCount(1);
    }

    const documentOrder = await page.evaluate(ids => {
      return ids.map(id => {
        const element = document.querySelector(`[data-testid="${id}"]`);
        return element
          ? element.getBoundingClientRect().top + window.scrollY
          : -1;
      });
    }, sectionIds);
    expect(documentOrder).toEqual([...documentOrder].sort((a, b) => a - b));

    await expect(
      page.getByTestId('artist-profile-section-social-proof')
    ).toHaveCount(0);
    await expect(page.getByTestId('artist-profile-section-trust')).toHaveCount(
      0
    );
    await expect(
      page.getByTestId('artist-profile-section-reactivation')
    ).toHaveCount(0);
    await expect(
      page.getByTestId('artist-profile-section-monetization')
    ).toHaveCount(0);
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

    const previousButton = outcomesSection.locator(
      'button[aria-label="Scroll Outcomes Left"]:visible'
    );
    const nextButton = outcomesSection.locator(
      'button[aria-label="Scroll Outcomes Right"]:visible'
    );
    await expect(previousButton).toHaveCount(1);
    await expect(nextButton).toHaveCount(1);

    for (const control of [previousButton, nextButton]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const initialScrollLeft = await grid.evaluate(
      element => element.scrollLeft
    );
    await nextButton.click();
    await expect
      .poll(() => grid.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(initialScrollLeft);
    const forwardScrollLeft = await grid.evaluate(
      element => element.scrollLeft
    );

    await previousButton.click();
    await expect
      .poll(() => grid.evaluate(element => element.scrollLeft))
      .toBeLessThan(forwardScrollLeft);

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

  test('capture, opinionated decisions, product truth, steps, and FAQ match the plan', async ({
    page,
  }) => {
    const captureSection = page.getByTestId('artist-profile-section-capture');
    await expect(
      captureSection.getByRole('heading', {
        name: 'Capture every fan, not just the click.',
      })
    ).toBeVisible();
    await expect(captureSection.getByText('You’re on the list')).toBeVisible();
    await expect(
      captureSection.getByText('Opt in once', { exact: true })
    ).toBeVisible();
    await expect(captureSection.getByText('Reach the moment')).toBeVisible();
    await expect(captureSection.getByText('Keep the audience')).toBeVisible();
    const capturePreview = captureSection.getByRole('img', {
      name: /example fan opt-in with an email or phone field/i,
    });
    await expect(capturePreview).toBeVisible();
    await expect(capturePreview.locator('input, button')).toHaveCount(0);

    const opinionatedSection = page.getByTestId(
      'artist-profile-section-opinionated'
    );
    await expect(
      opinionatedSection.getByRole('heading', {
        name: 'Built to convert, not decorate.',
      })
    ).toBeVisible();
    await expect(opinionatedSection.locator('article')).toHaveCount(3);
    await expect(
      opinionatedSection.getByText('No template maze.')
    ).toBeVisible();

    const specWallSection = page.getByTestId(
      'artist-profile-section-spec-wall'
    );
    await specWallSection.scrollIntoViewIfNeeded();

    await expect(
      specWallSection.getByRole('heading', {
        name: 'Built for artists.',
      })
    ).toBeVisible();
    await expect(
      specWallSection.getByTestId('artist-profile-truth-tile')
    ).toHaveCount(10);
    await expect(specWallSection.getByText('Fast load')).toBeVisible();
    await expect(
      specWallSection.getByText('Views, clicks, referrers')
    ).toBeVisible();

    const howSection = page.getByTestId('artist-profile-section-how-it-works');
    await expect(
      howSection.getByRole('heading', { name: 'One link. Three steps.' })
    ).toBeVisible();
    await expect(
      howSection.getByRole('heading', { name: 'Claim your profile.' })
    ).toBeVisible();
    await expect(
      howSection.getByRole('heading', {
        name: 'Connect your music and links.',
      })
    ).toBeVisible();
    await expect(
      howSection.getByRole('heading', { name: 'Share one link everywhere.' })
    ).toBeVisible();

    const faqSection = page.getByTestId('artist-profile-section-faq');
    await expect(
      faqSection.getByRole('heading', { name: 'Questions, answered.' })
    ).toBeVisible();
    await expect(faqSection.getByRole('button')).toHaveCount(4);
    const firstQuestion = faqSection.getByRole('button', {
      name: 'How is this different from Linktree?',
    });
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
    await expect(
      faqSection.getByText(/Jovie is built for music release behavior/i)
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
});
