import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('public investor brief', () => {
  test('renders the canonical brief, demo, CTA, and closed appendix', async ({
    page,
  }) => {
    const response = await page.goto('/pitch', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta).toMatch(/noindex/iu);
    expect(robotsMeta).toMatch(/nofollow/iu);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'operating layer'
    );
    await expect(page.locator('[data-pitch-demo-video]')).toBeVisible();
    await expect(page.locator('[data-pitch-slide]')).toHaveCount(7);
    await expect(
      page.getByRole('link', { name: 'Request A Meeting' }).first()
    ).toHaveAttribute('href', /mailto:t@meetjovie\.com/iu);

    const appendix = page.getByTestId('pitch-appendix');
    await expect(appendix).not.toHaveAttribute('open', '');
    await expect(appendix).toContainText('Legacy Pitch Deck');
  });

  test('preserves the legacy deck and PDF as appendix assets', async ({
    request,
  }) => {
    const [deck, pdf] = await Promise.all([
      request.head('/pitch/index.html'),
      request.head('/Jovie-Pitch-Deck.pdf'),
    ]);
    expect(deck.status()).toBe(200);
    expect(pdf.status()).toBe(200);
  });
});
