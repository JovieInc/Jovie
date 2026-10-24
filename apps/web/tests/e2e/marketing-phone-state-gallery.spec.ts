import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const galleryCss = readFileSync(
  path.resolve(
    __dirname,
    '../../components/marketing/MarketingProductStates.css'
  ),
  'utf8'
);

// Isolate the gallery's shipped stylesheet from route data and image loading.
async function mountGallery(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      :root { --space-4: 16px; --space-8: 32px; }
      main { margin-inline: 20px; --marketing-phone-gallery-bleed: 20px; }
      .marketing-phone-gallery__item { height: 100px; }
      ${galleryCss}
    </style>
    <main>
      <section class="marketing-phone-gallery" data-count="3" aria-label="Profile states" tabindex="0">
        <ul class="marketing-phone-gallery__list">
          <li class="marketing-phone-gallery__item">Listen</li>
          <li class="marketing-phone-gallery__item">Show up</li>
          <li class="marketing-phone-gallery__item">Stay close</li>
        </ul>
      </section>
    </main>
  `);
}

for (const width of [320, 390]) {
  test(`mobile gallery reaches both viewport edges at ${width}px without page overflow`, async ({
    page,
  }) => {
    await mountGallery(page, width);
    const rail = page.getByRole('region', { name: 'Profile states' });
    const bounds = await rail.boundingBox();
    expect(bounds?.x).toBe(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBe(width);
    expect((await rail.getByRole('listitem').first().boundingBox())?.x).toBe(
      20
    );

    await rail.focus();
    await expect(rail).toBeFocused();
    await rail.evaluate(element => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(() => rail.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(0);
    const last = await rail.getByRole('listitem').last().boundingBox();
    // scrollWidth rounds to whole pixels; flex item widths can be fractional.
    expect(Math.round((last?.x ?? 0) + (last?.width ?? 0))).toBeLessThanOrEqual(
      width
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(width);
  });
}

test('wide gallery stays inside the content column with all states visible', async ({
  page,
}) => {
  await mountGallery(page, 1024);
  const rail = page.getByRole('region', { name: 'Profile states' });
  expect(await rail.boundingBox()).toMatchObject({ x: 20, width: 984 });
  const states = await rail.getByRole('listitem').all();
  const bounds = await Promise.all(states.map(state => state.boundingBox()));
  expect(new Set(bounds.map(box => box?.y)).size).toBe(1);
  expect(await rail.evaluate(element => element.scrollWidth)).toBe(984);
});
