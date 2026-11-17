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
}
