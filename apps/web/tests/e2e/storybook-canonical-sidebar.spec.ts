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
      nav.locator('[data-sidebar-search-slot] [aria-label="New Chat"]')
    ).toHaveCount(1);
    await expect(
      nav.locator('[data-sidebar-search-slot] [aria-label="New Chat"]')
    ).toHaveCount(1);
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
        if (cycle === 0 && product.endsWith('operator')) {
          const groups = page.getByTestId('operator-lists-nav');
          for (const name of ['Collab list', 'Press', 'Favorites']) {
            const link = groups.getByRole('link', { name, exact: true });
            await expect(link).toBeVisible();
            await expect(link).toHaveAttribute('href', /\/app\/ov\/lists\//);
          }
          const geometry = await page.evaluate(() => {
            const reference = document
              .querySelector('[data-navigation-item-id] svg')!
              .getBoundingClientRect();
            return Array.from(
              document.querySelectorAll(
                '[data-testid="operator-lists-nav"] a, [data-testid="operator-lists-nav"] button'
              )
            ).map(element => {
              const box = element.getBoundingClientRect();
              const icon = element
                .querySelector('svg')!
                .getBoundingClientRect();
              return {
                label: element.getAttribute('aria-label'),
                center: icon.x + icon.width / 2,
                reference: reference.x + reference.width / 2,
                referenceWidth: reference.width,
                contained: icon.x >= box.x && icon.right <= box.right,
                width: icon.width,
                height: box.height,
              };
            });
          });
          expect(geometry).toHaveLength(4);
          for (const row of geometry) {
            expect(
              Math.abs(row.center - row.reference),
              row.label!
            ).toBeLessThanOrEqual(1);
            expect(row.contained, row.label!).toBe(true);
            expect(row.width).toBe(row.referenceWidth);
            expect(row.height).toBe(28);
          }
          const navigationScrollTop = await nav.evaluate(
            element => element.parentElement!.scrollTop
          );
          const favorite = groups.getByRole('link', {
            name: 'Favorites',
            exact: true,
          });
          await favorite.hover();
          await expect(page.getByRole('tooltip')).toContainText('Favorites');
          await expect(
            page.getByRole('button', { name: 'Expand sidebar', exact: true })
          ).toHaveAttribute('aria-expanded', 'false');
          // Tooltip intent scrolls the lower group into view. Restore the
          // captured viewport before comparing the original motion anchors.
          await nav.evaluate((element, scrollTop) => {
            element.parentElement!.scrollTop = scrollTop;
          }, navigationScrollTop);
        }
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
        '[data-sidebar-search-slot] [aria-label="New Chat"]'
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
      const toggle = page.getByRole('button', {
        name: 'Expand sidebar',
        exact: true,
      });
      const beforeHover = await toggle.boundingBox();
      await toggle.hover();
      await create.hover();
      await toggle.focus();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(await toggle.boundingBox()).toEqual(beforeHover);
      await expect(create).toHaveCount(1);
      await expect(headingAction).toHaveCount(1);
      await toggle.click();
      await expect(
        page.getByRole('button', { name: 'Collapse sidebar', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      expectStableSidebar(expanded, await readSidebarAnchors(page));
      await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .click();
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
    nav.locator('[data-sidebar-search-slot] [aria-label="New Chat"]')
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

test.describe('touch sidebar controls', () => {
  test.use({ hasTouch: true });
  test('tap opens a collapsed sidebar and reveals list creation', async ({
    page,
  }, testInfo) => {
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--admin-operator&viewMode=story'
    );
    const close = page.getByRole('button', {
      name: 'Collapse sidebar',
      exact: true,
    });
    await expect(close).toBeVisible({ timeout: 60_000 });
    await close.tap();
    const open = page.getByRole('button', {
      name: 'Expand sidebar',
      exact: true,
    });
    await expect(open).toHaveAttribute('aria-pressed', 'false');
    await open.tap();
    await expect(close).toHaveAttribute('aria-pressed', 'true');
    await close.tap();
    await page.getByRole('button', { name: 'New List', exact: true }).tap();
    await expect(close).toHaveAttribute('aria-pressed', 'true');
    const name = page.getByRole('textbox', { name: 'New List Name' });
    await expect(name).toBeFocused();
    await name.fill('Tour collaborators');
    await page.screenshot({ path: testInfo.outputPath('touch-new-list.png') });
    await name.press('Escape');
    await expect(
      page.getByRole('button', { name: 'New List', exact: true })
    ).toBeFocused();
    await page.keyboard.press('Alt+Shift+H');
    await expect(
      page.getByRole('link', { name: 'Home', exact: true })
    ).toBeFocused();
  });
});

for (const theme of ['dark', 'light']) {
  test(`Ovie main menu stays reachable on ultrawide in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 3440, height: 1440 });
    await page.emulateMedia({
      reducedMotion: theme === 'light' ? 'reduce' : 'no-preference',
    });
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--operator-shell&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const home = page.getByRole('link', { name: 'Home', exact: true });
    const tools = page.getByRole('button', { name: 'Tools', exact: true });
    await expect(home).toBeVisible({ timeout: 60_000 });
    await page.screenshot({
      path: testInfo.outputPath(`ovie-menu-${theme}-expanded.png`),
    });
    await page.locator('#shell-left-rail').screenshot({
      path: testInfo.outputPath(`ovie-sidebar-${theme}-expanded.png`),
    });
    await expect(
      page.getByRole('link', { name: 'Collab list', exact: true })
    ).toBeVisible();
    const labelStarts = await page.locator('#shell-left-rail').evaluate(rail =>
      [
        'button[aria-label="New List"] span',
        'a[aria-label="Collab list"] span',
      ].map(selector => {
        const label = rail.querySelector(selector);
        if (!label) throw new Error('Missing list label');
        const range = document.createRange();
        range.selectNodeContents(label);
        return range.getBoundingClientRect().x;
      })
    );
    expect(Math.abs(labelStarts[0] - labelStarts[1])).toBeLessThanOrEqual(1);
    const before = await home.boundingBox();
    const main = page.getByRole('main');
    const footer = page.locator('#shell-left-rail [data-sidebar="footer"]');
    const mainBefore = await main.boundingBox();
    const footerBefore = await footer.boundingBox();
    await page
      .getByRole('button', { name: 'Collapse sidebar', exact: true })
      .click();
    await expect(page.locator('#shell-left-rail')).toHaveAttribute(
      'data-rail-phase',
      'closed'
    );
    expect((await main.boundingBox())?.y).toBe(mainBefore!.y);
    expect((await main.boundingBox())?.height).toBe(mainBefore!.height);
    expect(await footer.boundingBox()).toMatchObject({
      y: footerBefore!.y,
      height: footerBefore!.height,
    });
    await page.locator('#shell-left-rail').screenshot({
      path: testInfo.outputPath(`ovie-sidebar-${theme}-collapsed.png`),
    });
    await expect(tools).toBeVisible();
    await tools.click();
    await expect(tools).toHaveAttribute('aria-expanded', 'true');
    await expect(home).toBeVisible();
    await page.keyboard.press('Alt+Shift+H');
    await expect(home).toBeFocused();
    await expect(page.locator('#shell-left-rail')).toHaveAttribute(
      'data-state',
      'open'
    );
    await expect(page.locator('#shell-left-rail')).toHaveAttribute(
      'data-rail-phase',
      'open'
    );
    await expect
      .poll(async () => (await home.boundingBox())?.y)
      .toBe(before!.y);
    const scroller = page.locator('[data-ov-navigation-scroll]');
    await expect(scroller).toBeVisible();
    // Force overflow with existing real nav rows at a short viewport.
    await page.setViewportSize({ width: 3440, height: 420 });
    const pinned = await home.boundingBox();
    await scroller.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    expect((await home.boundingBox())?.y).toBe(pinned!.y);
    await expect(home).toBeInViewport();
    await home.click({ trial: true });
    await page.screenshot({
      path: testInfo.outputPath(`ovie-menu-${theme}-scrolled.png`),
    });
  });
}

test('Ovie shortcuts keep keyboard scrolling inside the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 450 });
  await page.goto(
    '/iframe.html?id=organisms-keyboardshortcutssheet--ovie-navigation&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  expect(
    await dialog.evaluate(
      element => element.scrollHeight - element.clientHeight
    )
  ).toBeLessThanOrEqual(1);
  const list = dialog.getByRole('region', { name: 'Shortcuts' });
  const search = list.getByRole('textbox', { name: 'Search Shortcuts' });
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => list.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    dialog.getByRole('button', { name: 'Close', exact: true })
  ).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Ovie Tools preference survives mobile drawer to desktop resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--operator-shell&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator('[data-sidebar-brand-row]')).toBeAttached({
    timeout: 60_000,
  });
  await page.keyboard.press('Alt+Shift+H');
  const mobile = page.locator('#shell-left-rail[data-mobile="true"]');
  await expect(mobile).toBeVisible({ timeout: 60_000 });
  const controls = await page
    .getByRole('button', { name: 'Tools', exact: true, includeHidden: true })
    .evaluateAll(elements =>
      elements.map(element => element.getAttribute('aria-controls'))
    );
  expect(controls).toHaveLength(2);
  expect(controls.every(Boolean)).toBe(true);
  expect(new Set(controls).size).toBe(controls.length);
  const tools = mobile.getByRole('button', { name: 'Tools', exact: true });
  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Alt+Shift+H');
  await expect(
    mobile.getByRole('link', { name: 'Home', exact: true })
  ).toBeFocused();
  await page.setViewportSize({ width: 3440, height: 1440 });
  await expect(
    page.getByRole('button', { name: 'Tools', exact: true })
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('link', { name: 'Home', exact: true })
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(mobile).toHaveCount(0);
});
