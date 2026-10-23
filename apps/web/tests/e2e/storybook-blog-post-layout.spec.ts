import { expect, test } from '@playwright/test';

for (const width of [390, 1024, 1440]) {
  test(`blog prose and sidebar retain their reading layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      '/iframe.html?id=organisms-blogpostpage--canonical&viewMode=story'
    );
    const prose = page.getByRole('region', { name: 'Article content' });
    await expect(prose).toBeVisible();

    const layout = await prose.evaluate(element => {
      const grid = element.parentElement!.parentElement!;
      const sidebar = grid.querySelector('nav')!;
      const content = element.getBoundingClientRect();
      const toc = sidebar.getBoundingClientRect();
      return {
        prose: { x: content.x, width: content.width },
        sidebar: { x: toc.x, width: toc.width },
        available: grid.getBoundingClientRect().width,
        proseMax: Number.parseFloat(
          getComputedStyle(element).getPropertyValue('--ds-prose-max')
        ),
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });

    expect(layout.overflow).toBeLessThanOrEqual(0);
    const toc = page.getByRole('navigation', { name: 'Table of contents' });
    if (width < 1024) {
      await expect(toc).toBeHidden();
      expect(layout.prose.width).toBeCloseTo(layout.available, 0);
    } else {
      await expect(toc).toBeVisible();
      expect(layout.prose.width).toBeCloseTo(
        Math.min(layout.proseMax, layout.available - 220 - 48),
        0
      );
      expect(layout.sidebar.width).toBeCloseTo(220, 0);
      expect(
        layout.sidebar.x - layout.prose.x - layout.prose.width
      ).toBeCloseTo(48, 0);
    }
  });
}
