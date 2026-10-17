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
    nav.getByRole('link', { name: 'Inbox', exact: true })
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
    // The Inbox row (canonical `home` destination), not the slot's Inbox bell.
    const home = nav
      .getByRole('link', { name: 'Inbox', exact: true })
      .and(page.locator('[data-navigation-item-id="home"]'));
    const row = await home.boundingBox();
    expect(row!.height).toBe(28);
    const create = nav.getByRole('link', { name: 'New Chat' });
    await expect(create).toHaveCount(1);
    await expect(create).toHaveAttribute('href', '/app/chat');
    await expect(nav.locator('[data-sidebar-history-header]')).toContainText(
      'Today'
    );
    await expect(
      nav.locator('[data-sidebar-history-header] [aria-label="New Chat"]')
    ).toHaveCount(1);
    await expect(
      nav.locator('[data-sidebar-search-slot] [aria-label="New Chat"]')
    ).toHaveCount(0);
    await expect(
      nav.getByRole('button', { name: 'Filter Unread Chats' })
    ).toHaveCount(0);
    const box = await create.boundingBox();
    expect(box!.width).toBe(24);
    expect(box!.height).toBe(24);
    await create.focus();
    await expect(create).toBeFocused();
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
async function readSidebarAnchors(
  page: Page,
  activateAtFrame?: 'Collapse sidebar' | 'Expand sidebar'
) {
  return page.evaluate(async action => {
    if (action) {
      // Sample inside the renderer: host/IPC delays can outlast the entire
      // transition before a wall-clock 80ms probe reaches Chromium.
      const toggle = document.querySelector<HTMLButtonElement>(
        `button[data-rail-toggle="left"][aria-label="${action}"]`
      );
      if (!toggle) throw new Error('Missing sidebar control');
      const movingRail = document.querySelector(
        '[data-shell-rail-motion="left"]'
      );
      const fullWidth = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--app-shell-sidebar-width'
        )
      );
      toggle.click();
      const deadline = performance.now() + 1500;
      while (true) {
        await new Promise(requestAnimationFrame);
        const width = movingRail?.getBoundingClientRect().width ?? 0;
        if (width > 52 && width < fullWidth) break;
        if (performance.now() > deadline)
          throw new Error(
            'Sidebar never rendered an intermediate motion frame'
          );
      }
    }
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
      rail.querySelectorAll<HTMLElement>(
        '[data-navigation-item-id]:not([data-navigation-item-id="chat"])'
      )
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
  }, activateAtFrame);
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
      await page.evaluate(() => document.fonts.ready);
      if (product.endsWith('operator'))
        await expect(
          page.getByRole('button', { name: 'New List', exact: true })
        ).toBeVisible();
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
      if (product.endsWith('operator')) {
        expect(expanded.rows.length).toBeGreaterThan(3);
      } else {
        expect(expanded.rows.map(row => row.id)).toEqual(
          expect.arrayContaining(['home', 'library', 'audience'])
        );
      }
      const captures = [expanded];
      for (let cycle = 0; cycle < 10; cycle++) {
        const closing = await readSidebarAnchors(page, 'Collapse sidebar');
        await expect(
          page.getByRole('button', { name: 'Expand sidebar', exact: true })
        ).toBeVisible();
        captures.push(closing);
        expectStableSidebar(expanded, closing);
        expect(closing.railWidth).toBeGreaterThan(52);
        expect(closing.railWidth).toBeLessThan(expanded.railWidth);
        await page.waitForTimeout(470);
        const collapsed = await readSidebarAnchors(page);
        captures.push(collapsed);
        expectStableSidebar(expanded, collapsed);
        const opening = await readSidebarAnchors(page, 'Expand sidebar');
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

// JOV-7878: certify the action in the actual frame, header, rail and footer.
for (const history of ['composed-history', 'composed-empty-history']) {
  for (const theme of ['dark', 'light']) {
    test(`${history} has one compact creation action across rail modes in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript(
        value => localStorage.setItem('jovie-theme-storybook', value),
        theme
      );
      await page.goto(
        `/iframe.html?id=organisms-unifiedsidebar--${history}&viewMode=story`
      );
      const nav = page.getByRole('navigation', {
        name: 'Dashboard Navigation',
      });
      await expect(nav).toBeVisible({ timeout: 60_000 });
      const create = nav.getByRole('link', { name: 'New Chat', exact: true });
      const draft = page.getByRole('textbox', { name: 'Campaign Draft' });
      await draft.fill('Preserve this campaign draft');
      await draft.evaluate(element => {
        element.dataset.mountReceipt = 'original';
      });
      const expanded = await readSidebarAnchors(page);
      const headingAction = nav.locator(
        '[data-sidebar-history-header] [aria-label="New Chat"]'
      );
      await expect(headingAction).toHaveCount(1);
      await expect(create).toHaveCount(1);
      await expect(nav.getByText('New Chat', { exact: true })).toHaveCount(0);
      await expect(
        nav.getByRole('button', { name: 'Filter Unread Chats' })
      ).toHaveCount(0);
      await expect(nav.getByRole('link', { name: 'All chats' })).toHaveCount(
        history === 'composed-history' ? 1 : 0
      );
      const box = await create.boundingBox();
      expect(box!.width).toBe(24);
      expect(box!.height).toBe(24);
      await page.screenshot({
        path: testInfo.outputPath(`${history}-${theme}-expanded.png`),
      });
      // Observe the real link's keyboard/pointer activations without leaving
      // Storybook. Production href and pending acknowledgment stay intact.
      await nav.evaluate(element => {
        element.dataset.creationCount = '0';
        element.addEventListener(
          'click',
          event => {
            if ((event.target as Element).closest('[aria-label="New Chat"]')) {
              event.preventDefault();
              element.dataset.creationCount = String(
                Number(element.dataset.creationCount) + 1
              );
            }
          },
          true
        );
      });
      for (let cycle = 0; cycle < 10; cycle++) {
        await create.focus();
        await expect(create).toBeFocused();
        if (cycle % 2) await create.click();
        else await create.press('Enter');
        await expect(create).toHaveAttribute('data-navigation-pending', 'true');
        await page
          .getByRole('button', { name: 'Collapse sidebar', exact: true })
          .click();
        await expect(create).toHaveCount(1);
        await expect(
          nav.locator('[data-sidebar-search-slot] [aria-label="New Chat"]')
        ).toHaveCount(1);
        expectStableSidebar(expanded, await readSidebarAnchors(page));
        if (cycle === 0)
          await page.screenshot({
            path: testInfo.outputPath(`${history}-${theme}-compact.png`),
          });
        await page
          .getByRole('button', { name: 'Expand sidebar', exact: true })
          .press('Enter');
        await expect(headingAction).toHaveCount(1);
        expectStableSidebar(expanded, await readSidebarAnchors(page));
        await expect(draft).toHaveValue('Preserve this campaign draft');
        await expect(draft).toHaveAttribute('data-mount-receipt', 'original');
      }
      await expect(nav).toHaveAttribute('data-creation-count', '10');
      await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .click();
      await draft.focus();
      await page.mouse.move(900, 600);
      await page
        .getByRole('button', { name: 'Expand sidebar', exact: true })
        .hover();
      const pin = page.getByRole('button', {
        name: 'Pin sidebar',
        exact: true,
      });
      await expect(pin).toBeVisible();
      await create.hover();
      await expect(pin).toBeVisible();
      await create.focus();
      await expect(create).toBeFocused();
      await expect(headingAction).toHaveCount(1);
      await expect(create).toHaveCount(1);
      expectStableSidebar(expanded, await readSidebarAnchors(page));
      await page.screenshot({
        path: testInfo.outputPath(`${history}-${theme}-preview.png`),
      });
      await draft.focus();
      await page.mouse.move(900, 600);
      await expect(
        page.getByRole('button', { name: 'Expand sidebar', exact: true })
      ).toBeVisible();
      await expect(
        nav.locator('[data-sidebar-search-slot] [aria-label="New Chat"]')
      ).toHaveCount(1);
      await expect(draft).toHaveValue('Preserve this campaign draft');
    });
  }
}

test('mobile history keeps direct creation access in a short drawer', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--dashboard&viewMode=story'
  );
  const nav = page.getByRole('navigation', { name: 'Dashboard Navigation' });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  const create = nav.getByRole('link', { name: 'New Chat', exact: true });
  await expect(create).toHaveCount(1);
  await expect(create).toHaveAttribute('href', '/app/chat');
  await expect(
    nav.locator('[data-sidebar-history-header] [aria-label="New Chat"]')
  ).toHaveCount(1);
  await create.focus();
  await expect(create).toBeFocused();
  const box = await create.boundingBox();
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.y + box!.height).toBeLessThan(568);
  const target = await create.evaluate(element => {
    const after = getComputedStyle(element, '::after');
    const box = element.getBoundingClientRect();
    return (
      box.height -
      Number.parseFloat(after.top) -
      Number.parseFloat(after.bottom)
    );
  });
  expect(target).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: testInfo.outputPath('mobile-history-short.png'),
  });
});
