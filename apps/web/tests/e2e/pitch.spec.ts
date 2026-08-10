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

    await expect(
      page.getByRole('link', { name: 'Download Deck As PDF' })
    ).toHaveAttribute('href', '/Jovie-Pitch-Deck.pdf');

    const appendix = page.getByTestId('pitch-appendix');
    await expect(appendix).not.toHaveAttribute('open', '');
    await expect(appendix).toContainText('Narrative Boundary');
    await expect(appendix).toContainText('Risk Register');
    await expect(appendix).toContainText('Evidence Boundary');
    await expect(appendix).not.toContainText('Legacy Pitch Deck');
    await expect(appendix).not.toContainText('Downloadable Deck');
    await expect(appendix.locator('a')).toHaveCount(0);
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

const GEOMETRY_VIEWPORTS = [
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
] as const;

test.describe('shared investor brief 44px target geometry', () => {
  for (const viewport of GEOMETRY_VIEWPORTS) {
    test(`keeps logo link, meeting CTA, and summaries ≥44px at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto('/pitch', {
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
