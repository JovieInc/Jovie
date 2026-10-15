import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

test.use({ storageState: { cookies: [], origins: [] } });

async function enterProfileSettings(page: Page) {
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.SETTINGS_PROFILE)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.SETTINGS_PROFILE}$`));
  await expect(
    page.locator('[data-app-shell-frame="true"]:visible')
  ).toHaveCount(1);
  await expect(page.getByTestId('settings-shell-content')).toBeVisible();
  await expect(page.locator('#displayName')).toBeVisible();
  await expect(page.locator('#shell-artist-profile-rail')).toHaveAttribute(
    'aria-hidden',
    'false'
  );
  await expect(page.locator('#shell-artist-profile-rail')).toHaveAttribute(
    'data-rail-phase',
    'open'
  );
}

async function readPaneGeometry(page: Page) {
  return page.evaluate(() => {
    const visible = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]')
        );
      });
    const selectors = {
      route: '[data-testid="app-shell-scroll"]',
      pane: '[data-testid="settings-shell-content"]',
      column: '[data-settings-layout-column="true"]',
      field: '#displayName',
      rail: '#shell-artist-profile-rail',
    };
    const elements = Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => [
        name,
        visible(selector),
      ])
    );
    const counts = Object.fromEntries(
      Object.entries(elements).map(([name, matches]) => [name, matches.length])
    );
    if (Object.values(counts).some(count => count !== 1)) {
      return { counts, geometry: null };
    }
    const box = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    };
    const route = box(elements.route[0]);
    const pane = box(elements.pane[0]);
    const column = box(elements.column[0]);
    const field = box(elements.field[0]);
    const rail = box(elements.rail[0]);
    // The overlay's painted/hit-test allocation is independent of the route
    // pane marker. A narrowed empty marker cannot certify an overflowing form.
    const railMount = elements.rail[0].closest<HTMLElement>(
      '.shell-inspector-overlay'
    );
    const occupiedRail = railMount ? box(railMount) : rail;
    return {
      counts,
      geometry: {
        route,
        pane,
        column,
        field,
        occupiedRail,
        centerDelta: Math.abs(
          (column.left + column.right - pane.left - pane.right) / 2
        ),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      },
    };
  });
}

test('Profile companion leaves one centered usable settings pane', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires the isolated dev-auth E2E lane'
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterProfileSettings(page);

  const result = await readPaneGeometry(page);
  await testInfo.attach('settings-pane-geometry.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.counts).toEqual({
    route: 1,
    pane: 1,
    column: 1,
    field: 1,
    rail: 1,
  });
  expect(result.geometry).not.toBeNull();
  const geometry = result.geometry!;
  expect(
    geometry.centerDelta,
    'form centers in the actual usable pane'
  ).toBeLessThanOrEqual(1);
  expect(geometry.pane.left).toBeGreaterThanOrEqual(geometry.route.left - 1);
  expect(
    geometry.pane.right,
    'pane ends before occupied rail bounds'
  ).toBeLessThanOrEqual(geometry.occupiedRail.left + 1);
  expect(
    geometry.occupiedRail.left - geometry.pane.right,
    'no stranded rail-sized space'
  ).toBeLessThanOrEqual(16);
  expect(geometry.column.left).toBeGreaterThanOrEqual(geometry.pane.left - 1);
  expect(geometry.column.right).toBeLessThanOrEqual(geometry.pane.right + 1);
  expect(geometry.field.left).toBeGreaterThanOrEqual(geometry.column.left - 1);
  expect(geometry.field.right).toBeLessThanOrEqual(geometry.column.right + 1);
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
});
