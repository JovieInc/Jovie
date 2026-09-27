import { expect, test } from './setup';

/**
 * Investor surfaces are private: every public request gets a neutral,
 * non-indexable 404, and only the gated portal serves the brief and deck.
 */
const PRIVATE_URLS = [
  '/investors',
  '/pitch',
  '/pitch/index.html',
  '/Jovie-Pitch-Deck.pdf',
  '/investor-portal',
  '/investor-portal/memo',
  '/investor-portal/deck/Jovie-Pitch-Deck.pdf',
  '/investor-portal/deck/index.html',
] as const;

const DECK_PDF_URL = '/investor-portal/deck/Jovie-Pitch-Deck.pdf';

test.describe('investor surfaces without access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('answer a neutral 404 with noindex headers', async ({ request }) => {
    for (const url of PRIVATE_URLS) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(response.headers()['x-robots-tag'], url).toMatch(/noindex/iu);
      expect(await response.text(), url).not.toMatch(/investor brief/iu);
    }
  });

  test('rejects an unknown investor link token', async ({ request }) => {
    const response = await request.get('/investor-portal?t=not-a-real-token', {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(response.headers()['x-robots-tag']).toMatch(/noindex/iu);
  });
});

const GEOMETRY_VIEWPORTS = [
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
] as const;

test.describe('investor portal with an admin session', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'dev-auth bypass not enabled'
    );
    await page.goto(
      `/api/dev/test-auth/enter?persona=admin&redirect=${encodeURIComponent('/app')}`
    );
  });

  test('renders the brief and serves the gated deck', async ({ page }) => {
    const response = await page.goto('/investor-portal', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-robots-tag']).toMatch(/noindex/iu);

    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta).toMatch(/noindex/iu);

    await expect(page.locator('[data-pitch-demo-video]')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Download Deck As PDF' })
    ).toHaveAttribute('href', DECK_PDF_URL);

    const deck = await page.request.get(DECK_PDF_URL);
    expect(deck.status()).toBe(200);
    expect(deck.headers()['content-type']).toBe('application/pdf');
    expect(deck.headers()['x-robots-tag']).toMatch(/noindex/iu);
    expect(deck.headers()['cache-control']).toContain('no-store');
  });

  for (const viewport of GEOMETRY_VIEWPORTS) {
    test(`keeps logo link, meeting CTA, and summaries ≥44px at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto('/investor-portal', {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);

      const targets = [
        page.getByRole('link', { name: 'Jovie Home' }),
        page.getByRole('link', { name: 'Request A Meeting' }).first(),
        ...(await page.locator('summary').all()),
      ];
      expect(targets.length).toBeGreaterThanOrEqual(5);

      for (const target of targets) {
        // Effective hit height: the visible box or the Button primitive's
        // ::before hit-area pseudo, whichever is taller.
        const hitHeight = await target.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const beforeHeight = Number.parseFloat(
            getComputedStyle(element, '::before').height
          );
          return Math.max(
            rect.height,
            Number.isNaN(beforeHeight) ? 0 : beforeHeight
          );
        });
        expect(hitHeight).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
