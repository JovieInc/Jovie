import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1126, height: 798 } });

// One optical column: the account mark, Chat and every nav icon share the
// x32 sidebar column (Pen shell, docs/design-system/shell-ia.md).
for (const story of ['dashboard', 'admin-dashboard', 'composed-history']) {
  test(`${story} keeps the account mark, Chat and nav icons on one column`, async ({
    page,
  }) => {
    await page.goto(
      `/iframe.html?id=organisms-unifiedsidebar--${story}&viewMode=story`,
      { waitUntil: 'domcontentloaded' }
    );
    const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
    await expect(nav).toBeVisible({ timeout: 60_000 });
    const create = nav.getByRole('link', { name: 'Chat', exact: true });
    await expect(create).toHaveCount(1);
    await expect(create).toContainText('Chat');
    await expect(nav.locator('[data-sidebar-search-slot]')).toHaveCount(0);
    const column = await page.evaluate(() => {
      const center = (el: Element | null) => {
        const box = el?.getBoundingClientRect();
        return box ? Math.round(box.left + box.width / 2) : Number.NaN;
      };
      const left =
        document
          .querySelector('[data-shell-rail-motion="left"]')
          ?.getBoundingClientRect().left ?? Number.NaN;
      const mark = document.querySelector('.sidebar-footer-mark');
      const rows = document.querySelectorAll(
        'nav[aria-label="Dashboard Navigation"] a[data-navigation-item-id]'
      );
      return {
        mark: center(mark) - left,
        icons: Array.from(rows, row => center(row.querySelector('svg')) - left),
      };
    });
    expect(column.icons.length).toBeGreaterThan(1);
    for (const icon of column.icons) expect(icon).toBe(32);
    expect(column.mark).toBe(32);
  });
}
