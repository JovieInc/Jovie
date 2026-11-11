import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1126, height: 798 } });

// One optical column: the brand mark, New Chat and every nav icon share the
// 12px sidebar inset (Pen shell, docs/design-system/shell-ia.md).
for (const story of ['dashboard', 'admin-dashboard', 'composed-history']) {
  test(`${story} keeps the brand, New Chat and nav icons on one column`, async ({
    page,
  }) => {
    await page.goto(
      `/iframe.html?id=organisms-unifiedsidebar--${story}&viewMode=story`,
      { waitUntil: 'domcontentloaded' }
    );
    const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
    await expect(nav).toBeVisible({ timeout: 60_000 });
    // Header owns bell and search, so New Chat is a labeled row.
    const create = nav.locator(
      '[data-nav-section="create"] [data-navigation-item-id="chat"]'
    );
    await expect(create).toHaveCount(1);
    await expect(create).toContainText('New Chat');
    await expect(nav.locator('[data-sidebar-search-slot]')).toHaveCount(0);
    const column = await page.evaluate(() => {
      const left = (el: Element | null | undefined) =>
        el ? Math.round(el.getBoundingClientRect().left) : Number.NaN;
      const rail = document.querySelector('[data-shell-rail-motion="left"]');
      const brand = document.querySelector('[data-sidebar-brand-row] svg');
      const rows = document.querySelectorAll(
        'nav[aria-label="Dashboard Navigation"] a[data-navigation-item-id]'
      );
      return {
        brand: left(brand) - left(rail),
        icons: Array.from(
          rows,
          row => left(row.querySelector('svg')) - left(rail)
        ),
      };
    });
    expect(column.icons.length).toBeGreaterThan(1);
    for (const icon of column.icons) expect(icon).toBe(12);
    expect(column.brand).toBe(12);
  });

  // Vertical optical line: the brand mark, the bell and the search icons
  // must share one center at one size — a size or offset drift on any of
  // them reads as the header sitting on two lines (founder note 2026-11-09:
  // the x-only column guard let a 20px mark ship on a 16px icon row).
  test(`${story} keeps the brand row on one vertical optical center`, async ({
    page,
  }) => {
    await page.goto(
      `/iframe.html?id=organisms-unifiedsidebar--${story}&viewMode=story`,
      { waitUntil: 'domcontentloaded' }
    );
    const row = page.locator('[data-sidebar-brand-row]');
    await expect(row).toBeVisible({ timeout: 60_000 });
    const geometry = await row.evaluate((rowEl: Element) => {
      const center = (el: Element | null | undefined) => {
        if (!el) return Number.NaN;
        const box = el.getBoundingClientRect();
        return box.y + box.height / 2;
      };
      const brandMark = rowEl.querySelector('svg');
      const bellIcon = rowEl.querySelector('a svg');
      const searchIcon = rowEl.querySelector('[data-app-search-trigger] svg');
      const rowBox = rowEl.getBoundingClientRect();
      return {
        row: rowBox.y + rowBox.height / 2,
        brandMark: center(brandMark),
        bell: center(bellIcon),
        search: center(searchIcon),
        markSize: brandMark
          ? Math.round(brandMark.getBoundingClientRect().width)
          : Number.NaN,
        navIconSize: document.querySelector(
          'nav[aria-label="Dashboard Navigation"] a[data-navigation-item-id] svg'
        )
          ? Math.round(
              document
                .querySelector(
                  'nav[aria-label="Dashboard Navigation"] a[data-navigation-item-id] svg'
                )
                .getBoundingClientRect().width
            )
          : Number.NaN,
      };
    });
    const line = geometry.row;
    expect(line).not.toBeNaN();
    for (const center of [geometry.brandMark, geometry.bell, geometry.search]) {
      expect(Math.abs(center - line)).toBeLessThanOrEqual(1);
    }
    // One scale, not just one center: the brand mark must match the nav
    // icon size exactly (the 16px rail scale).
    expect(geometry.markSize).toBe(geometry.navIconSize);
  });
}
