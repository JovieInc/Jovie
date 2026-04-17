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
    await expect(
      page.getByRole('heading', {
        name: /the link your music deserves\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /claim your profile/i })
    ).toBeVisible();
    await expect(page.getByLabel(/choose your handle/i)).toBeVisible();
  });

  test('final CTA renders with claim form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /ready to amplify\?/i })
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
      'Jovie artist profile showing the default profile view before a mode is opened.'
    );

    await expect(heroHeading).toBeVisible();
    await expect(claimForm).toBeVisible();
    await expect(phone).toBeVisible();

    const adaptiveTop = await getDocumentY(adaptiveSection);
    await scrollToY(page, Math.max(0, adaptiveTop - 20));

    await expect(adaptiveHeading).toBeVisible();
    await expect(adaptiveSubcaption).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Drive Streams' })
    ).toBeVisible();
    await expect(
      page.getByText('Keep the latest music one tap away.')
    ).toBeVisible();
    await expectFullyInViewport(page, adaptivePhone);

    const trustRect = await getClientRect(trust);
    const viewportHeight = await getViewportHeight(page);
    expect(trustRect.top).toBeGreaterThanOrEqual(viewportHeight);

    const stayBookedTab = page.getByRole('button', { name: 'Stay Booked' });
    await expect(stayBookedTab).toBeVisible();
    await stayBookedTab.click();
    await expect(
      page.getByText('Make booking, management, and press easy to reach.')
    ).toBeVisible();
    await expect(
      page.getByAltText(
        'Jovie artist profile showing contact access for booking and press.'
      )
    ).toBeVisible();

    const trustTop = await getDocumentY(trust);
    await scrollToY(page, Math.max(0, trustTop - 120));
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
      'Jovie artist profile showing the default profile view before a mode is opened.'
    );

    await expect(heroHeading).toBeVisible();
    await expect(page.getByTestId('homepage-claim-form')).toBeVisible();
    await expect(phone).toBeVisible();

    const adaptiveTop = await getDocumentY(adaptiveSection);
    await scrollToY(page, Math.max(0, adaptiveTop - 36));

    await expect(adaptiveHeading).toBeVisible();
    await expect(page.getByText('Adapts to every fan.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Drive Streams' })
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

  test('outcomes carousel hides scrollbars without causing page overflow', async ({
    page,
  }) => {
    await expectNoHorizontalOverflow(page);

    const outcomesSection = page.getByTestId('artist-profile-section-outcomes');
    await outcomesSection.scrollIntoViewIfNeeded();

    const scroller = page.getByTestId('artist-profile-outcomes-scroller');
    await expect(scroller).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /drive streams/i })
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await outcomesSection.scrollIntoViewIfNeeded();
    await expect(scroller).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('spec wall renders the final seven cards without legacy philosophy copy', async ({
    page,
  }) => {
    const specWallSection = page.getByTestId(
      'artist-profile-section-spec-wall'
    );
    await specWallSection.scrollIntoViewIfNeeded();

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
        name: 'Details that pull their weight.',
      })
    ).toBeVisible();
    await expect(
      specWallSection.getByText(
        'Built from 15 years of music marketing experience, obsessing over the details that make a profile convert.'
      )
    ).toBeVisible();
    await expect(
      specWallSection.getByText(
        'A slow profile kills conversions. Jovie is built to a much higher speed bar than a typical link-in-bio page.'
      )
    ).toBeVisible();
    await expect(specWallSection.getByText('Power features')).toHaveCount(0);
    await expect(
      specWallSection.getByText('Audience quality filtering')
    ).toHaveCount(0);
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
