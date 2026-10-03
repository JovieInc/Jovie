import { expect, type Locator, test } from '@playwright/test';

/**
 * JOV-7192: the onboarding DSP match strip used to sit on the Listen now
 * pill inside the /start phone preview (golden-path keyframe anonymous-chat).
 * These viewports match that journey: Desktop Chrome 1280×720, and the
 * public-profile mobile keyframe 390×844 where the inline rail is shown.
 */

const STORY_PREFIX = 'features-onboarding-onboardingprofilerail';

const VIEWPORTS = [
  {
    id: 'desktop',
    story: 'side-clearance',
    width: 1280,
    height: 720,
  },
  {
    id: 'mobile',
    story: 'inline-clearance',
    width: 390,
    height: 844,
  },
] as const;

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function readBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(
    box,
    await locator.evaluate(element => element.tagName)
  ).not.toBeNull();
  return box as Box;
}

for (const viewport of VIEWPORTS) {
  test(`keeps the DSP match strip clear of Listen now at ${viewport.id} (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(
      `/iframe.html?id=${STORY_PREFIX}--${viewport.story}&viewMode=story`,
      { waitUntil: 'domcontentloaded' }
    );

    const phone = page.getByTestId('onboarding-phone-preview');
    // The visible screen is the aspect-ratio `.mobile-web-screen`, which can
    // overflow a height-clamped frame. Measure it, not the frame's box: the
    // 2026-10-03 golden-path blocker was the screen overflowing under the
    // strip while the frame box itself cleared it.
    const screen = page.locator('[data-device="mobile-web"]').first();
    const strip = page.getByTestId('onboarding-dsp-match-strip');
    const cta = phone.getByRole('link', { name: 'Listen now' });
    await expect(phone).toBeVisible();
    await expect(strip).toBeVisible();
    await expect(cta).toBeVisible();

    const screenBox = await readBox(screen);
    const stripBox = await readBox(strip);
    const ctaBox = await readBox(cta);

    if (viewport.id === 'desktop') {
      // As rendered in the golden-path keyframe: no scrolling, the whole
      // CTA is on screen and clear of the strip.
      expect(
        ctaBox.y + ctaBox.height,
        `Listen now is cut off by the phone at ${viewport.id}`
      ).toBeLessThanOrEqual(screenBox.y + screenBox.height + 1);
    } else {
      // The inline phone is shorter than the home card; bring the CTA into
      // the phone before measuring.
      await cta.scrollIntoViewIfNeeded();
    }

    const visibleCta = intersects(await readBox(cta), screenBox);
    expect(
      visibleCta.height,
      `Listen now is clipped inside the phone at ${viewport.id}`
    ).toBeGreaterThan(8);
    expect(
      overlaps(visibleCta, stripBox),
      `DSP strip overlaps Listen now at ${viewport.id}: cta=${JSON.stringify(visibleCta)} strip=${JSON.stringify(stripBox)} screen=${JSON.stringify(screenBox)}`
    ).toBe(false);
    // The strip sits in the hero's top-left corner, above the profile
    // identity, never in the CTA band.
    const name = phone.getByRole('link', { name: 'Test Artist' }).first();
    const nameBox = await readBox(name);
    expect(
      stripBox.y + stripBox.height,
      `DSP strip reaches the profile identity at ${viewport.id}`
    ).toBeLessThanOrEqual(nameBox.y);
  });
}
