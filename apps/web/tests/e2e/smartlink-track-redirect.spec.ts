import { expect, test } from '@playwright/test';
import { installPublicRouteMocks } from './utils/public-surface-helpers';

/**
 * Track smart-link redirect regression (JOV-6456).
 *
 * `/{username}/{trackSlug}` for a track that belongs to a release renders
 * the client-only `PreserveSearchRedirect` so `?dsp=`/UTM query params
 * survive the hop to `/{username}/{releaseSlug}/{trackSlug}`, while keeping
 * the route statically prerendered. Before the fix, that component
 * `return null`ed, so the browser painted a blank page until hydration ran
 * the redirect `useEffect`. Verifies:
 *   - The pre-redirect paint is never blank — the SSR HTML itself renders
 *     the shared smart-link loading shell, not nothing.
 *   - The query string survives the redirect end-to-end in a real browser.
 *
 * `edgecase-long` is a deterministic (non-Spotify-synced) QA fixture whose
 * seeded track slug differs from its release slug, so it reliably takes the
 * track short-URL code path instead of resolving as a release.
 *
 * @regression
 */

test.use({ storageState: { cookies: [], origins: [] } });

const HANDLE = 'edgecase-long';
const TRACK_SLUG = 'an-extremely-long-track-title-edge-case';
const RELEASE_SLUG = 'an-extremely-long-album-title-edge-case';
const QUERY = '?utm_source=jov6456&ref=redirect-test';

const sourcePath = `/${HANDLE}/${TRACK_SLUG}${QUERY}`;
const expectedFinalPath = `/${HANDLE}/${RELEASE_SLUG}/${TRACK_SLUG}${QUERY}`;

test.describe('Track smart-link redirect @regression', () => {
  test.setTimeout(60_000);

  test('pre-redirect SSR shell is never blank', async ({ request }) => {
    const response = await request.get(sourcePath, { timeout: 30_000 });
    expect(response.status()).toBe(200);

    const html = await response.text();
    // This is what a browser paints before any client JS runs — it must
    // render the shared smart-link loading shell, not an empty body.
    expect(html).toContain('data-slot="loading-skeleton"');
    expect(html).toContain('smart-link-powered-by');
  });

  test('redirects to the nested track URL, preserving query params', async ({
    page,
  }) => {
    await installPublicRouteMocks(page);

    const response = await page.goto(sourcePath, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    expect(response?.status() ?? 0).toBeLessThan(400);

    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search, {
        timeout: 15_000,
        message: 'track short link did not redirect to the nested track URL',
      })
      .toBe(expectedFinalPath);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
  });
});
