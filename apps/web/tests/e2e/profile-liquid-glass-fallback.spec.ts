import { expect, type Page, test } from '@playwright/test';

const PROFILE_ROUTE = '/dualipa';
const NAV_SELECTOR = '[data-testid="profile-bottom-nav"]';

type NavMaterial = {
  readonly backdropFilter: string;
  readonly backgroundColor: string;
  readonly backgroundImage: string;
};

async function readNavMaterial(page: Page) {
  return page.locator(NAV_SELECTOR).evaluate<NavMaterial>(element => {
    const style = getComputedStyle(element);
    return {
      backdropFilter:
        style.backdropFilter ||
        style.getPropertyValue('-webkit-backdrop-filter'),
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
    };
  });
}

test.describe('public profile Liquid Glass fallbacks', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });

  test('manual reduced-transparency and high-contrast hooks remove glass at runtime', async ({
    page,
  }) => {
    await page.goto(PROFILE_ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(NAV_SELECTOR)).toBeVisible();

    const glass = await readNavMaterial(page);
    expect(glass.backdropFilter).not.toBe('none');

    for (const mode of ['reduced-transparency', 'high-contrast'] as const) {
      await page.evaluate(activeMode => {
        const root = document.documentElement;
        root.removeAttribute('data-reduced-transparency');
        root.classList.remove('high-contrast');
        if (activeMode === 'reduced-transparency') {
          root.dataset.reducedTransparency = 'true';
        } else {
          root.classList.add('high-contrast');
        }
      }, mode);

      await expect
        .poll(async () => (await readNavMaterial(page)).backdropFilter)
        .toBe('none');

      const solid = await readNavMaterial(page);
      expect(solid.backgroundImage).toBe('none');
      expect(solid.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(solid.backgroundColor).not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)/);
    }
  });
});
