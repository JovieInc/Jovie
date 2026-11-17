import { expect, test } from '@playwright/test';
import { installPublicRouteMocks } from './utils/public-surface-helpers';

/**
 * Legacy numeric track URLs keep working (JOV-7140).
 *
 * The legacy slug migration (lib/discography/slug-migration.ts) renames
 * bug-made track slugs such as `/tim/sober/sober-2` to their plain title
 * slug. Links already shared outside Jovie keep the `-N` form, so the track
 * route 308s a missing `-N` track slug to the plain slug when that track
 * exists on the same release. Verifies, at phone and desktop widths:
 *   - the old URL permanently redirects to the plain track URL;
 *   - the destination renders the track page (title, no not-found copy);
 *   - nothing overflows horizontally.
 *
 * `edgecase-long` is a deterministic seeded QA fixture whose track slug has no
 * numeric suffix, so `{track}-2` exercises exactly the fallback.
 *
 * @regression
 */

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: 'reduce',
});

const HANDLE = 'edgecase-long';
const RELEASE_SLUG = 'an-extremely-long-album-title-edge-case';
const TRACK_SLUG = 'an-extremely-long-track-title-edge-case';
const legacyPath = `/${HANDLE}/${RELEASE_SLUG}/${TRACK_SLUG}-2`;
const plainPath = `/${HANDLE}/${RELEASE_SLUG}/${TRACK_SLUG}`;

for (const width of [390, 1280]) {
  test(`legacy -N track URL lands on the plain track page at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width, height: 900 });

    const response = await page.goto(legacyPath, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    expect(response?.status()).toBe(200);
    const hop = await response?.request().redirectedFrom()?.response();
    expect(hop?.status(), `${legacyPath} must redirect permanently`).toBe(308);
    expect(new URL(page.url()).pathname).toBe(plainPath);

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    expect((await heading.textContent())?.trim() ?? '').not.toMatch(
      /content not found|profile not found/i
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);

    const capture = testInfo.outputPath(`legacy-track-slug-${width}.png`);
    await page.screenshot({ path: capture, fullPage: true });
    await testInfo.attach(`legacy-track-slug-${width}`, {
      path: capture,
      contentType: 'image/png',
    });
  });
}
