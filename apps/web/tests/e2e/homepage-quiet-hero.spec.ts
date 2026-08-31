import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

// JOV-INV-024: rendered-layout certification is exact-head browser evidence.
const LOCKED_HEADLINE = 'Own your story. Know your audience. Never lose a fan.';
const VIEWPORTS = [
  { label: 'compact', width: 320, height: 740 },
  { label: 'mobile', width: 390, height: 844 },
  { label: 'narrow', width: 440, height: 900 },
  { label: 'medium', width: 768, height: 1024 },
  { label: 'wide', width: 1280, height: 800 },
  { label: 'desktop', width: 1440, height: 900 },
] as const;
const EXPECTED_HEAD_SHA = process.env.REVIEW_EXPECTED_HEAD_SHA?.trim();
const REVIEW_CERTIFICATION_REQUESTED =
  process.env.REVIEW_CERTIFICATION_REQUIRED === '1' ||
  Boolean(EXPECTED_HEAD_SHA);

test.use({ storageState: { cookies: [], origins: [] } });

async function settleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.describe('founder-locked Quiet homepage hero', () => {
  test('hosted review route proves the exact PR head', async ({ request }) => {
    test.skip(
      !REVIEW_CERTIFICATION_REQUESTED,
      'set REVIEW_CERTIFICATION_REQUIRED=1 for hosted review certification'
    );

    if (!EXPECTED_HEAD_SHA) {
      throw new Error(
        'REVIEW_EXPECTED_HEAD_SHA must be set in certification mode'
      );
    }
    expect(EXPECTED_HEAD_SHA).toMatch(/^[0-9a-f]{40}$/);
    const reviewUrl = new URL(process.env.BASE_URL ?? '');
    expect(reviewUrl.protocol).toBe('https:');
    expect(reviewUrl.hostname).not.toMatch(
      /^(?:localhost|.*\.localhost|.*\.local|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|0\.0\.0\.0|\[?::1\]?)$/i
    );

    const response = await request.get(
      new URL('/api/health/build-info', reviewUrl).toString()
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      commitSha: EXPECTED_HEAD_SHA,
    });
    console.log(
      `[quiet-hero-provenance] ${JSON.stringify({ reviewUrl: reviewUrl.origin, commitSha: EXPECTED_HEAD_SHA })}`
    );
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} keeps the locked H1 complete and within two visual lines`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      const heading = page.getByRole('heading', {
        level: 1,
        name: LOCKED_HEADLINE,
        exact: true,
      });
      await expect(heading).toBeVisible();
      await settleLayout(page);

      const firstBox = await heading.boundingBox();
      await settleLayout(page);
      expect(await heading.boundingBox()).toEqual(firstBox);

      const metrics = await heading.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          fullText: element.textContent,
          lines: Math.ceil(
            element.getBoundingClientRect().height /
              Number.parseFloat(style.lineHeight) -
              0.05
          ),
        };
      });

      expect(metrics.fullText).toBe(LOCKED_HEADLINE);
      expect(
        metrics.lines,
        `${viewport.label} H1 painted ${metrics.lines} lines; the founder lock permits at most two`
      ).toBeLessThanOrEqual(2);
      console.log(
        `[quiet-hero-proof] ${JSON.stringify({ ...viewport, ...metrics })}`
      );
      await testInfo.attach('rendered-line-count.json', {
        body: JSON.stringify({ ...viewport, ...metrics }, null, 2),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: testInfo.outputPath(`quiet-hero-${viewport.label}.png`),
        fullPage: false,
      });
    });
  }
});
