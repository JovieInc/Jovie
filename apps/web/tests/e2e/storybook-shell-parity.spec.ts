import { expect, type Page, test } from '@playwright/test';
import { controls } from './utils/shell-rail-controls';

async function shellGeometry(page: Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-shell-rail-motion="left"]');
    if (!rail) throw new Error('Missing shared sidebar');
    const rect = (element: Element | null) => {
      if (!element) throw new Error('Missing shell anchor');
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const rows = Array.from(
      rail.querySelectorAll<HTMLElement>('nav [data-navigation-item-id]')
    )
      .filter(row => row.getBoundingClientRect().height > 0)
      .slice(0, 4)
      .map(row => ({ id: row.dataset.navigationItemId, ...rect(row) }));
    return {
      rail: rect(rail),
      header: rect(rail.querySelector('[data-sidebar="header"]')),
      brand: rect(rail.querySelector('[data-sidebar-brand-row]')),
      main: rect(document.querySelector('main')),
      rows,
    };
  });
}

test('compact desktop rhythm preserves neighboring touch targets below lg', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 806 });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--dashboard&viewMode=story'
  );
  const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  const create = nav.locator('[data-navigation-item-id="chat"]');
  const destination = nav.locator('[data-navigation-item-id="presence"]');
  const createBox = await create.boundingBox();
  const destinationBox = await destination.boundingBox();
  expect(createBox).not.toBeNull();
  expect(destinationBox).not.toBeNull();
  const hitOwners = await page.evaluate(
    ({ create, destination }) =>
      [
        { x: create.x + create.width / 2, y: create.y + create.height - 1 },
        { x: destination.x + destination.width / 2, y: destination.y + 1 },
      ].map(point =>
        document
          .elementFromPoint(point.x, point.y)
          ?.closest<HTMLElement>('[data-navigation-item-id]')
          ?.getAttribute('data-navigation-item-id')
      ),
    { create: createBox!, destination: destinationBox! }
  );
  expect(hitOwners).toEqual(['chat', 'presence']);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`workspaces share header and navigation rhythm (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1512, height: 806 });
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      localStorage.setItem('jovie-theme-storybook', 'dark');
      Object.defineProperty(window, 'matchMedia', {
        configurable: false,
        writable: false,
        value: window.matchMedia.bind(window),
      });
      new MutationObserver(() => {
        document
          .querySelectorAll('[data-jovie-storybook-fixtures]')
          .forEach(node => node.remove());
      }).observe(document, { childList: true, subtree: true });
    });
    const samples = [];
    for (const workspace of ['dashboard', 'operator']) {
      await page.goto(
        `/iframe.html?id=organisms-authshell--${workspace}&viewMode=story`
      );
      const nav = page.getByRole('navigation', {
        name:
          workspace === 'operator' ? 'OV Navigation' : 'Dashboard Navigation',
      });
      await expect(nav).toBeVisible({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      const toggle = controls(page, 'left');
      await expect(toggle).toHaveCount(1);
      if ((await toggle.getAttribute('aria-pressed')) === 'false')
        await toggle.click();
      await expect
        .poll(async () => (await shellGeometry(page)).rail.width)
        .toBe(224);
      const expanded = await shellGeometry(page);
      expect(expanded.rows).toHaveLength(4);
      if (workspace === 'dashboard') {
        await expect(
          nav.getByRole('link', { name: 'New Chat' })
        ).toHaveAttribute('href', '/app/chat');
      }
      for (let cycle = 0; cycle < 3; cycle++) {
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      }
      const reopened = await shellGeometry(page);
      expect(reopened.rows.map(row => row.y)).toEqual(
        expanded.rows.map(row => row.y)
      );
      samples.push(expanded);
    }
    const [customer, operator] = samples;
    expect(customer.header).toEqual(operator.header);
    expect(customer.brand).toEqual(operator.brand);
    expect(customer.main).toEqual(operator.main);
    expect(customer.rows.map(row => row.y)).toEqual(
      operator.rows.map(row => row.y)
    );
    expect(customer.rows.map(row => row.height)).toEqual(
      operator.rows.map(row => row.height)
    );
    await testInfo.attach('shared-shell-geometry.json', {
      body: JSON.stringify({ reducedMotion, customer, operator }),
      contentType: 'application/json',
    });
  });
}
