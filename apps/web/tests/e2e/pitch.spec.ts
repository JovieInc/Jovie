import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('public /pitch route', () => {
  test('renders the deck iframe, is NOINDEX', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto('/pitch', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    // NOINDEX contract — both the wrapper page AND the deck HTML must be noindex.
    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta).toMatch(/noindex/i);
    expect(robotsMeta).toMatch(/nofollow/i);

    // Iframe is present and points at the canonical static deck.
    const iframeEl = page.locator('iframe[title="Jovie Pitch Deck"]');
    await expect(iframeEl).toHaveAttribute('src', '/pitch/index.html');

    // Deck content renders inside the iframe.
    const deck = page.frameLocator('iframe[title="Jovie Pitch Deck"]');
    await expect(deck.locator('deck-stage')).toBeAttached();
    await expect(
      deck.locator('section[data-label="Meet Jovie"]')
    ).toBeAttached();

    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  });

  test('canonical deck HTML serves directly with NOINDEX', async ({ page }) => {
    const response = await page.goto('/pitch/index.html', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta).toMatch(/noindex/i);

    // The custom element registers and the first slide is mounted.
    await expect(page.locator('deck-stage')).toBeAttached();
    await expect(
      page.locator('section[data-label="Meet Jovie"]')
    ).toBeAttached();
  });

  test('deck-stage.js is reachable', async ({ request }) => {
    const res = await request.head('/pitch/deck-stage.js');
    expect(res.status()).toBe(200);
  });
});
