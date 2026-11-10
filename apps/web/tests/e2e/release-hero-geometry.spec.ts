import { expect, test } from '@playwright/test';

// "No text on text" (DESIGN.md rule 8): at mobile 390 the release hero is a
// clean square with title and artist below it in normal flow, edge-aligned to
// the art. Geometry guard, independent of platform font/pixel rendering.
test.use({ viewport: { width: 390, height: 844 } });

test('release hero art is square with the title below it, edge-aligned', async ({
  page,
}) => {
  await page.goto('/demo/showcase/release-presave', {
    waitUntil: 'networkidle',
  });
  const rect = async (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate(element => {
        const r = element.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      });

  const artSelector = '[data-testid="smart-link-artwork"]';
  const art = await rect(artSelector);
  const title = await rect('h1');
  const artWidth = art.right - art.left;

  expect(artWidth, 'art is 350px at 390 (20px gutters)').toBeCloseTo(350, 0);
  expect(art.bottom - art.top, 'art stays square').toBeCloseTo(artWidth, 0);
  expect(title.top, 'title never overlaps the art').toBeGreaterThanOrEqual(
    art.bottom + 16
  );
  expect(title.left, 'title aligns to the art edge').toBeCloseTo(art.left, 0);
  expect(
    await page.locator(artSelector).evaluate(el => el.textContent?.trim()),
    'no text renders inside the art bounds'
  ).toBe('');
});
