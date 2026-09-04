import { expect, type Page, test } from '@playwright/test';

const SKELETON = 'ui-atoms-skeleton--certification-matrix';
const LOADING = 'ui-atoms-skeleton--loading-certification-matrix';
const BUTTON = 'ui-loadingskeleton--button-geometry-comparison';
const RADII = ['none', 'sm', 'md', 'lg', 'full'] as const;
const THEMES = ['light', 'dark'] as const;
const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'compact', width: 390, height: 844 },
] as const;

test.describe.configure({ mode: 'serial' });

async function open(
  page: Page,
  story: string,
  theme: (typeof THEMES)[number] = 'dark',
  motion = false
) {
  await page.goto(
    `/iframe.html?id=${story}&viewMode=story${motion ? '&jovieMotion=allow' : ''}`,
    { waitUntil: 'domcontentloaded' }
  );
  await page.evaluate(
    value => localStorage.setItem('jovie-theme-storybook', value),
    theme
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
}

async function overflows(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return (
      root.scrollWidth > innerWidth + 1 || root.scrollHeight > innerHeight + 1
    );
  });
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`Skeleton matrix: ${theme}, ${viewport.id}, motion, zoom`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await open(page, SKELETON, theme, true);
      const items = page
        .getByTestId('skeleton-certification-matrix')
        .locator('[data-slot="skeleton"]');
      await expect(items).toHaveCount(10);
      const rendered = await items.evaluateAll(
        (nodes, radii) =>
          nodes.map(node => ({
            radius: radii.find(value =>
              node.classList.contains(`rounded-${value}`)
            ),
            state: node.getAttribute('data-state'),
          })),
        RADII
      );
      expect(rendered.map(item => item.state)).toEqual(
        RADII.flatMap(() => ['shimmer', 'static'])
      );
      expect(rendered.map(item => item.radius)).toEqual(
        RADII.flatMap(value => [value, value])
      );
      const [animated, still, style] = await Promise.all([
        items.nth(0).boundingBox(),
        items.nth(1).boundingBox(),
        items.nth(0).evaluate(element => {
          const css = getComputedStyle(element);
          return [css.animationName, css.backgroundImage, css.backgroundColor];
        }),
      ]);
      expect({ height: animated?.height, width: animated?.width }).toEqual({
        height: still?.height,
        width: still?.width,
      });
      expect(style[0]).not.toBe('none');
      expect(style[1]).not.toBe('none');
      expect(style[2]).not.toBe('rgba(0, 0, 0, 0)');
      expect(await overflows(page)).toBe(false);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      expect(await overflows(page)).toBe(false);
    });
  }
}

test('LoadingSkeleton covers every radius with one named owner', async ({
  page,
}) => {
  await open(page, LOADING);
  const matrix = page.getByTestId('loading-skeleton-certification-matrix');
  const owners = matrix.locator('[data-slot="loading-skeleton"]');
  await expect(owners).toHaveCount(10);
  const result = await owners.evaluateAll(nodes =>
    nodes.map(node => ({
      atomic: node.getAttribute('aria-atomic'),
      busy: node.getAttribute('aria-busy'),
      label: node.getAttribute('aria-label'),
      lines: node.getAttribute('data-lines'),
      live: node.getAttribute('aria-live'),
      radius: node.getAttribute('data-rounded'),
      role: node.getAttribute('role'),
      rows: [...node.querySelectorAll('[data-slot="skeleton"]')].map(row => ({
        hidden: row.getAttribute('aria-hidden'),
        rect: row.getBoundingClientRect().toJSON(),
      })),
    }))
  );
  expect(result).toHaveLength(10);
  expect(result.map(item => item.radius)).toEqual([...RADII, ...RADII]);
  for (const owner of result.slice(0, 5)) {
    expect(owner).toMatchObject({
      atomic: 'true',
      busy: 'true',
      lines: '3',
      live: 'polite',
      role: 'status',
    });
    expect(owner.label).toMatch(/^Loading .+ certification content$/);
    expect(owner.rows.map(row => row.hidden)).toEqual(['true', 'true', 'true']);
    expect(owner.rows[2].rect.width).toBeLessThan(owner.rows[0].rect.width);
    expect(owner.rows[2].rect.height).toBe(owner.rows[0].rect.height);
  }
  for (const owner of result.slice(5)) {
    expect(owner).toMatchObject({
      label: null,
      lines: '1',
      live: null,
      role: null,
    });
  }
  expect(await overflows(page)).toBe(false);
});

test('reduced motion keeps geometry and token fill in both themes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of THEMES) {
    await open(page, SKELETON, theme, true);
    const item = page.locator('[data-slot="skeleton"]').first();
    const [box, style] = await Promise.all([
      item.boundingBox(),
      item.evaluate(element => {
        const css = getComputedStyle(element);
        return [css.animationName, css.backgroundImage, css.backgroundColor];
      }),
    ]);
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
    expect(style.slice(0, 2)).toEqual(['none', 'none']);
    expect(style[2]).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('ButtonSkeleton preserves loaded geometry', async ({ page }) => {
  await open(page, BUTTON);
  const skeleton = page
    .getByTestId('button-skeleton-geometry')
    .locator('[data-slot="skeleton"]');
  const [loading, loaded] = await Promise.all([
    skeleton.boundingBox(),
    page.getByTestId('loaded-button-geometry').boundingBox(),
  ]);
  expect({ height: loading?.height, width: loading?.width }).toEqual({
    height: loaded?.height,
    width: loaded?.width,
  });
});
