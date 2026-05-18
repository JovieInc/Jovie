import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('public /pitch route', () => {
  test('renders the deck, is NOINDEX, exposes the PDF link', async ({
    page,
  }) => {
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

    // NOINDEX_ROBOTS contract — the page must never be indexed.
    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta).toMatch(/noindex/i);
    expect(robotsMeta).toMatch(/nofollow/i);

    // Deck renders — first slide title is visible (manifest's first slide is
    // 01-cover.md whose first H1 is rendered as the slide title).
    const firstSlideTitle = page.getByRole('heading', { level: 2 }).first();
    await expect(firstSlideTitle).toBeVisible();
    const titleText = (await firstSlideTitle.textContent())?.trim();
    expect(titleText).toBeTruthy();

    // Navigation control: at least the Next button is reachable when more
    // than one slide exists. There must always be a slide counter ("1 / N").
    await expect(page.getByText(/^\d+ \/ \d+$/)).toBeVisible();

    // PDF download anchor points at the manifest's static asset.
    const pdfLink = page.getByRole('link', {
      name: /download deck as pdf/i,
    });
    await expect(pdfLink).toBeVisible();
    const href = await pdfLink.getAttribute('href');
    expect(href).toBe('/Jovie-Pitch-Deck.pdf');

    // No client-side console errors on first paint.
    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  });

  test('PDF asset is reachable from public/', async ({ request }) => {
    const res = await request.head('/Jovie-Pitch-Deck.pdf');
    expect(
      res.status(),
      'Run `pnpm deck:pdf` (or regenerate via Playwright) and commit apps/web/public/Jovie-Pitch-Deck.pdf'
    ).toBe(200);
  });
});
