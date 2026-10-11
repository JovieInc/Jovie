import { expect, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 1126, height: 798 } });

test('collapsed demo keeps its command allocation and stages secondary controls', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--demo&viewMode=story'
  );
  const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  const create = nav.getByRole('link', { name: 'New Chat' });
  const before = await create.boundingBox();
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  const after = await create.boundingBox();
  expect(after!.y).toBe(before!.y);
  expect(after!.height).toBe(before!.height);
  const rail = await page
    .locator('[data-shell-rail-motion="left"]')
    .boundingBox();
  expect(after!.x).toBeGreaterThanOrEqual(rail!.x);
  expect(after!.x + after!.width).toBeLessThanOrEqual(rail!.x + rail!.width);
  const secondary = page.locator('[data-sidebar-search-slot] > [inert]');
  await expect(secondary).toHaveAttribute('aria-hidden', 'true');
  await expect(
    nav.getByRole('link', { name: 'Home', exact: true })
  ).toHaveCount(1);
});

for (const theme of ['dark', 'light']) {
  test(`canonical sidebar keeps geometry and keyboard actions in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--dashboard&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
    await expect(nav).toBeVisible({ timeout: 60_000 });
    await expect(nav.getByText('Today', { exact: true })).toBeVisible();
    await expect(nav.getByText('Earlier', { exact: true })).toBeVisible();
    const footer = page.locator('[data-sidebar="footer"]');
    const before = await footer.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.y + before!.height).toBeCloseTo(
      page.viewportSize()!.height,
      0
    );
    const home = nav.getByRole('link', { name: 'Home' });
    const row = await home.boundingBox();
    expect(row!.height).toBe(28);
    const create = nav.getByRole('link', { name: 'New Chat' });
    const colors = await create.evaluate(element => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(colors.foreground).not.toBe(colors.background);
    await nav.getByRole('button', { name: 'Filter Unread Chats' }).focus();
    await page.keyboard.press('Enter');
    await expect(nav.getByText('No unread chats')).toBeVisible();
    expect(await footer.boundingBox()).toEqual(before);
    await page.keyboard.press('Enter');
    await expect(nav.getByText('Merch drop checklist')).toBeVisible();
    expect(await footer.boundingBox()).toEqual(before);
    await expect(nav.getByRole('link', { name: 'All chats' })).toHaveAttribute(
      'href',
      '/app/chats'
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`canonical-sidebar-${theme}.png`),
    });
  });
}

// JOV-8017: exercise the actual shared composition, including CSS and footer.
async function readSidebarAnchors(page: Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-shell-rail-motion="left"]');
    const brand = rail?.querySelector<HTMLElement>(
      '[data-sidebar="header"] [data-brand-variant]'
    );
    const header = rail?.querySelector('[data-sidebar="header"]');
    const footer = rail?.querySelector('[data-sidebar="footer"]');
    const account = footer?.querySelector('button');
    if (!rail || !brand || !header || !footer || !account)
      throw new Error('Incomplete composed sidebar');
    let opacity = 1;
    let painted = true;
    const brandBox = brand.getBoundingClientRect();
    for (let node: Element | null = brand; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      painted &&= style.visibility !== 'hidden' && style.display !== 'none';
      if (['hidden', 'clip'].includes(style.overflowX)) {
        const box = node.getBoundingClientRect();
        painted &&=
          brandBox.left >= box.left - 1 && brandBox.right <= box.right + 1;
      }
    }
    const rows = Array.from(
      rail.querySelectorAll<HTMLElement>('[data-navigation-item-id]')
    ).map(row => {
      const box = row.getBoundingClientRect();
      const icon = row.querySelector('svg')?.getBoundingClientRect();
      return {
        id: row.dataset.navigationItemId!,
        top: box.top,
        height: box.height,
        iconY: icon ? icon.top + icon.height / 2 : null,
      };
    });
    const accountBox = account.getBoundingClientRect();
    return {
      railWidth: rail.getBoundingClientRect().width,
      brandY: brandBox.top + brandBox.height / 2,
      // AskJovieMark intentionally rests at 60% opacity. Ancestor staging
      // must never fade it below that visible resting treatment.
      brandPainted: painted && opacity >= 0.5 && brandBox.width > 0,
      headerBottom: header.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
      accountTop: accountBox.top,
      accountY: accountBox.top + accountBox.height / 2,
      rows,
    };
  });
}

function expectStableSidebar(
  before: Awaited<ReturnType<typeof readSidebarAnchors>>,
  after: Awaited<ReturnType<typeof readSidebarAnchors>>
) {
  expect(
    after.brandPainted,
    'canonical logo remains painted and unclipped'
  ).toBe(true);
  for (const key of [
    'brandY',
    'headerBottom',
    'footerTop',
    'accountTop',
    'accountY',
  ] as const) {
    expect(
      Math.abs(after[key] - before[key]),
      `${key} retains its vertical anchor`
    ).toBeLessThanOrEqual(1);
  }
  expect(after.rows.map(row => row.id)).toEqual(before.rows.map(row => row.id));
  for (let i = 0; i < before.rows.length; i++) {
    const first = before.rows[i];
    const last = after.rows[i];
    expect(
      Math.abs(last.top - first.top),
      `${first.id} row top`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(last.height - first.height),
      `${first.id} row height`
    ).toBeLessThanOrEqual(1);
    if (first.iconY !== null && last.iconY !== null)
      expect(
        Math.abs(last.iconY - first.iconY),
        `${first.id} icon center`
      ).toBeLessThanOrEqual(1);
  }
}

for (const product of [
  'dashboard',
  'operator',
  'admin-dashboard',
  'admin-operator',
] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`${product} keeps logo and vertical anchors through rail intent in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript(value => {
        localStorage.setItem('jovie-theme-storybook', value);
        (
          window as Window & {
            __shellMotionMatchMedia?: typeof window.matchMedia;
          }
        ).__shellMotionMatchMedia = window.matchMedia.bind(window);
      }, theme);
      await page.goto(
        `/iframe.html?id=organisms-unifiedsidebar--${product}&viewMode=story`
      );
      const nav = page.getByRole('navigation', {
        name: product.endsWith('operator')
          ? 'OV Navigation'
          : 'Dashboard Navigation',
      });
      await expect(nav).toBeVisible({ timeout: 60_000 });
      // This spec checks motion, so restore the real media query and remove only
      // Storybook's snapshot-freezing style. Product motion remains untouched.
      await page.evaluate(() => {
        document.querySelector('[data-jovie-storybook-fixtures]')?.remove();
        const original = (
          window as Window & {
            __shellMotionMatchMedia?: typeof window.matchMedia;
          }
        ).__shellMotionMatchMedia;
        if (original) window.matchMedia = original;
      });
      const expanded = await readSidebarAnchors(page);
      expect(expanded.brandPainted).toBe(true);
      expect(expanded.rows.length).toBeGreaterThan(3);
      const captures = [expanded];
      for (let cycle = 0; cycle < 3; cycle++) {
        await page
          .getByRole('button', { name: 'Collapse sidebar', exact: true })
          .click();
        await expect(
          page.getByRole('button', { name: 'Expand sidebar', exact: true })
        ).toBeVisible();
        await page.waitForTimeout(80);
        const closing = await readSidebarAnchors(page);
        captures.push(closing);
        expectStableSidebar(expanded, closing);
        expect(closing.railWidth).toBeGreaterThan(52);
        expect(closing.railWidth).toBeLessThan(expanded.railWidth);
        await page.waitForTimeout(470);
        const collapsed = await readSidebarAnchors(page);
        captures.push(collapsed);
        expectStableSidebar(expanded, collapsed);
        await page
          .getByRole('button', { name: 'Expand sidebar', exact: true })
          .press(cycle % 2 ? 'Space' : 'Enter');
        await page.waitForTimeout(80);
        const opening = await readSidebarAnchors(page);
        captures.push(opening);
        expectStableSidebar(expanded, opening);
        expect(opening.railWidth).toBeGreaterThan(52);
        expect(opening.railWidth).toBeLessThan(expanded.railWidth);
        await page.waitForTimeout(470);
        expectStableSidebar(expanded, await readSidebarAnchors(page));
      }
      // Reverse while width is still moving; latest intent must win.
      await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .press('Enter');
      await page.waitForTimeout(80);
      expectStableSidebar(expanded, await readSidebarAnchors(page));
      await page
        .getByRole('button', { name: 'Expand sidebar', exact: true })
        .press('Enter');
      await page.waitForTimeout(550);
      expectStableSidebar(expanded, await readSidebarAnchors(page));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .click();
      expectStableSidebar(expanded, await readSidebarAnchors(page));
      await page
        .getByRole('button', { name: 'Expand sidebar', exact: true })
        .click();
      await page.setViewportSize({ width: 1030, height: 600 });
      const short = await readSidebarAnchors(page);
      await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .click();
      expectStableSidebar(short, await readSidebarAnchors(page));
      await testInfo.attach('sidebar-anchors.json', {
        body: JSON.stringify(captures),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: testInfo.outputPath(`${product}-${theme}-collapsed.png`),
      });
    });
  }
}
