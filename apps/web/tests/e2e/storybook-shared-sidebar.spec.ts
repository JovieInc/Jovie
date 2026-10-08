import { expect, test } from '@playwright/test';

const story = (operator = false) =>
  `/iframe.html?id=organisms-unifiedsidebar--${operator ? 'operator-shared-shell' : 'shared-shell'}&viewMode=story`;

interface ScaleFlowWindow {
  sidebarFlowMarks: { phase: string; time: number }[];
  sidebarFlowFrames: number[];
  sidebarFlowRaf: number;
  sidebarPaletteRenderSamples: { phase: string; duration: number }[];
  sidebarScaleTasks: { duration: number; start: number }[];
  sidebarScaleObserver: PerformanceObserver;
}

for (const operator of [false, true]) {
  test(`Electron collapsed ${operator ? 'Ovie' : 'Jovie'} titlebar clears native controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.addInitScript(() => {
      // Layout-only bridge fixture. Actual Electron overlay bounds are covered
      // separately; this CI regression exercises the real shell and stylesheet.
      Object.assign(window, { electronAPI: { platform: 'darwin' } });
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.desktopRuntime = 'electron';
      });
    });
    await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
    const toggle = page.getByTestId('electron-sidebar-toggle');
    await expect(toggle).toBeVisible();
    const titlebar = page.getByTestId('electron-titlebar-row');
    const header = page.locator('[data-app-shell-header="true"]');
    const heading = header.getByRole('heading').first();
    const navigation = page.getByTestId('electron-nav-pill');

    // 72px is the compatibility fallback;100px was measured in Electron44.5.1.
    // A larger native reserve must also preserve reachability after resize.
    for (const nativeReserve of [100, 72, 120]) {
      await page.evaluate(reserve => {
        document.documentElement.style.setProperty(
          '--electron-traffic-light-safe-width',
          `${reserve}px`
        );
      }, nativeReserve);
      const pinnedToggle = await toggle.boundingBox();
      const pinnedHeader = await header.boundingBox();
      await toggle.click();
      await expect(page.locator('#shell-left-rail')).toHaveAttribute(
        'data-rail-phase',
        'closed'
      );
      const collapsedHeader = await header.boundingBox();
      const collapsedToggle = await toggle.boundingBox();
      const pageTitle = await heading.boundingBox();
      const controls = await navigation.boundingBox();
      expect(pageTitle!.x).toBeGreaterThanOrEqual(
        controls!.x + controls!.width
      );
      expect(collapsedToggle).toEqual(pinnedToggle);
      expect(collapsedHeader!.y).toBe(pinnedHeader!.y);
      expect((await titlebar.boundingBox())!.height).toBe(44);
      expect(collapsedHeader!.height).toBe(44);
      await toggle.press('Enter');
      await expect(page.locator('#shell-left-rail')).toHaveAttribute(
        'data-rail-preview',
        'true'
      );
      expect(await header.boundingBox()).toEqual(collapsedHeader);
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
      await toggle.press('Enter');
      await page
        .getByRole('button', { name: 'Pin Sidebar', exact: true })
        .click();
      await expect(toggle).toHaveAccessibleName('Collapse sidebar');
    }
  });
}

for (const operator of [false, true]) {
  test(`shared ${operator ? 'Ovie' : 'Jovie'} rail keeps vertical geometry and exclusive controls`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
    const rail = page.locator('#shell-left-rail');
    const header = page.locator('[data-app-shell-header="true"]');
    const footer = page.locator('[data-sidebar="footer"]');
    const content = page.getByTestId('sidebar-experience-content');
    await expect(
      page.getByRole('button', { name: 'Collapse sidebar', exact: true })
    ).toBeVisible();
    const bounds = async () => ({
      header: await header.boundingBox(),
      footer: await footer.boundingBox(),
      content: await content.boundingBox(),
    });
    const pinned = await bounds();
    const pinnedBrand = await page
      .getByTestId('ask-jovie-trigger')
      .filter({ visible: true })
      .boundingBox();
    await page.screenshot({ path: info.outputPath('pinned.png') });
    const menuTrigger = page.getByRole('button', {
      name: operator ? 'More Pages' : 'Recent Chats',
    });
    await menuTrigger.click();
    const overlay = page.locator(
      `[data-sidebar-flyout="${operator ? 'more' : 'recent'}"]`
    );
    await expect(overlay).toBeVisible();
    const popup = await overlay.boundingBox();
    expect(popup!.y).toBeGreaterThanOrEqual(
      pinned.header!.y + pinned.header!.height + 8
    );
    expect(await bounds()).toEqual(pinned);
    await page.screenshot({ path: info.outputPath('open-menu.png') });
    await page.keyboard.press('Escape');
    await expect(menuTrigger).toBeFocused();
    await page
      .getByRole('button', { name: 'Collapse sidebar', exact: true })
      .click();
    await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
    const collapsed = await bounds();
    const collapsedBrand = await page
      .getByTestId('ask-jovie-trigger')
      .filter({ visible: true })
      .boundingBox();
    expect(collapsedBrand!.x).toBe(pinnedBrand!.x);
    expect(collapsedBrand!.y).toBe(pinnedBrand!.y);
    expect(collapsed.header!.y).toBe(pinned.header!.y);
    expect(collapsed.content!.y).toBe(pinned.content!.y);
    await expect(
      page.getByRole('button', { name: 'Expand sidebar', exact: true })
    ).toHaveCount(1);
    await expect(page.locator('[data-sidebar-toolbar="true"]')).toBeHidden();
    await page.screenshot({ path: info.outputPath('collapsed.png') });
    await page
      .getByRole('button', { name: 'Expand sidebar', exact: true })
      .click();
    await expect(rail).toHaveAttribute('data-rail-preview', 'true');
    const floating = await bounds();
    expect(floating.header).toEqual(collapsed.header);
    expect(floating.content).toEqual(collapsed.content);
    expect(floating.footer!.y).toBe(pinned.footer!.y);
    const surface = await page
      .locator('[data-sidebar-surface="true"]')
      .boundingBox();
    expect(surface!.y).toBe(pinned.header!.y + pinned.header!.height + 8);
    expect(surface!.width).toBe(244);
    await page.screenshot({ path: info.outputPath('floating.png') });
    await menuTrigger.click();
    await expect(overlay).toBeVisible();
    expect(await bounds()).toEqual(floating);
    await page.keyboard.press('Escape');
    await expect(menuTrigger).toBeFocused();
    await expect(rail).toHaveAttribute('data-rail-preview', 'true');
    await page.keyboard.press('Escape');
    await expect(rail).not.toHaveAttribute('data-rail-preview', 'true');
    await expect(
      page.getByRole('button', { name: 'Expand sidebar', exact: true })
    ).toBeFocused();
    await page.keyboard.press('Enter');
    const pin = page.getByRole('button', { name: 'Pin Sidebar', exact: true });
    await pin.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Collapse sidebar', exact: true })
    ).toBeFocused();
    await expect(rail).not.toHaveAttribute('data-rail-preview', 'true');
  });
}

for (const width of [320, 375, 390, 768]) {
  test(`compact overflow stays in its drawer at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(story(true), { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'Expand sidebar', exact: true })
      .click();
    const drawer = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'More Pages' }).click();
    const menu = drawer.locator('[data-sidebar-flyout="more"]');
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('menuitem', { name: 'Back', exact: true })
    ).toBeVisible();
    const box = await menu.boundingBox();
    const drawerBox = await drawer.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(drawerBox!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      drawerBox!.x + drawerBox!.width
    );
    await menu.getByRole('menuitem', { name: 'Back', exact: true }).click();
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole('button', { name: 'More Pages' })
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

test('Recent stays within the mobile drawer with a reversible Back action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(story(), { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Expand sidebar', exact: true })
    .click();
  const drawer = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
  await drawer.getByRole('button', { name: 'Recent Chats' }).click();
  const recent = drawer.locator('[data-sidebar-flyout="recent"]');
  await expect(recent).toBeVisible();
  const box = await recent.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await recent.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    drawer.getByRole('button', { name: 'Recent Chats' })
  ).toBeFocused();
  await expect(drawer).toBeVisible();
});

for (const width of [1024, 1440, 1920]) {
  test(`detached media preserves the real composer at ${width}px and short height`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 450 });
    await page.goto(
      '/iframe.html?id=organisms-unifiedsidebar--shared-media-shell&viewMode=story',
      { waitUntil: 'domcontentloaded' }
    );
    const composer = page.getByTestId('chat-composer-surface');
    await expect(composer).toBeVisible();
    await page.getByRole('button', { name: 'Load sample track' }).click();
    await page
      .getByRole('button', { name: 'Hide Player', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Collapse sidebar', exact: true })
      .click();
    const dock = page.locator(
      '[data-shell-audio-surface="sidebar-compact"][data-state="visible"]'
    );
    await expect(dock).toBeVisible();
    const media = await dock.boundingBox();
    const input = await composer.boundingBox();
    if (
      media!.x < input!.x + input!.width &&
      media!.x + media!.width > input!.x
    )
      expect(media!.y + media!.height).toBeLessThanOrEqual(input!.y);
    expect(media!.y).toBeGreaterThanOrEqual(60);
    await dock.hover();
    await expect(page.locator('#shell-left-rail')).not.toHaveAttribute(
      'data-rail-preview',
      'true'
    );
    await dock.getByRole('button', { name: 'Show Player' }).click();
    await expect(
      page.locator('[data-shell-audio-surface="sidebar-compact"]')
    ).toHaveAttribute('data-state', 'reserved');
    await expect(
      page.getByRole('button', { name: 'Hide Player', exact: true })
    ).toBeVisible();
  });
}

test('keyboard pinning preserves focus and reduced-motion RTL geometry', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(story(true), { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: 'Recent Chats', exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
  });
  const rail = page.locator('#shell-left-rail');
  const content = page.getByTestId('sidebar-experience-content');
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  const closed = await content.boundingBox();
  const expand = page.getByRole('button', {
    name: 'Expand sidebar',
    exact: true,
  });
  await expand.focus();
  await page.keyboard.press('Enter');
  await expect(rail).toHaveAttribute('data-rail-phase', 'open');
  expect(await content.boundingBox()).toEqual(closed);
  const pin = page.getByRole('button', { name: 'Pin Sidebar', exact: true });
  await pin.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Collapse sidebar', exact: true })
  ).toBeFocused();
  await expect(rail).not.toHaveAttribute('data-rail-preview', 'true');
});

test('mobile toggles preserve the saved desktop preference across reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(story(), { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain('sidebar:state=false');
  await page.setViewportSize({ width: 390, height: 700 });
  const expand = page.getByRole('button', {
    name: 'Expand sidebar',
    exact: true,
  });
  await expand.click();
  const drawer = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
  const collapse = drawer.getByRole('button', {
    name: 'Collapse sidebar',
    exact: true,
  });
  await expect(collapse).toHaveAttribute('aria-pressed', 'true');
  await collapse.click();
  await expect(drawer).toBeHidden();
  expect(await page.evaluate(() => document.cookie)).toContain(
    'sidebar:state=false'
  );
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: 'Expand sidebar', exact: true })
  ).toBeVisible();
});

test('floating rail preserves the main plane during repeated reversals', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(story(), { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  await expect(page.locator('#shell-left-rail')).toHaveAttribute(
    'data-rail-phase',
    'closed'
  );
  await page.evaluate(() => {
    const samples: {
      time: number;
      bounds: Record<string, number[]>;
      scroll: number[];
    }[] = [];
    const tasks: { start: number; duration: number }[] = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries())
        tasks.push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: 'longtask', buffered: false });
    let sampling = true;
    const frame = (time: number) => {
      const bounds: Record<string, number[]> = {};
      for (const [name, selector] of Object.entries({
        main: '[data-testid="sidebar-experience-content"]',
        header: '[data-app-shell-header="true"]',
        footer: '[data-sidebar="footer"]',
        account: '[data-testid="sidebar-identity-group"]',
        navigation: '[data-navigation-item-id="home"]',
        recent: '[data-sidebar-flyout="recent-trigger"]',
      })) {
        const element = document.querySelector<HTMLElement>(selector);
        if (element) {
          const box = element.getBoundingClientRect();
          if (box.height > 0)
            bounds[name] = [box.x, box.y, box.width, box.height];
        }
      }
      const main = document.querySelector<HTMLElement>(
        '[data-testid="sidebar-experience-content"]'
      )!;
      samples.push({
        time,
        bounds,
        scroll: [
          window.scrollX,
          window.scrollY,
          main.scrollLeft,
          main.scrollTop,
        ],
      });
      if (sampling) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    Object.assign(window, {
      finishRailMeasurement: () => {
        sampling = false;
        observer.disconnect();
        return { samples, tasks };
      },
    });
  });
  for (let iteration = 0; iteration < 6; iteration++) {
    const label = iteration % 2 === 0 ? 'Expand sidebar' : 'Close sidebar';
    const toggle = page
      .getByTestId('sidebar-rail-toggle')
      .filter({ visible: true });
    await expect(toggle).toHaveAccessibleName(label);
    await toggle.click();
  }
  await expect(page.locator('#shell-left-rail')).toHaveAttribute(
    'data-rail-phase',
    'closed'
  );
  const measurement = await page.evaluate(() =>
    (
      window as unknown as {
        finishRailMeasurement: () => {
          samples: {
            time: number;
            bounds: Record<string, number[]>;
            scroll: number[];
          }[];
          tasks: { start: number; duration: number }[];
        };
      }
    ).finishRailMeasurement()
  );
  expect(measurement.samples.length).toBeGreaterThan(5);
  for (const name of [
    'main',
    'header',
    'footer',
    'account',
    'navigation',
    'recent',
  ]) {
    const boxes = measurement.samples.flatMap(sample =>
      sample.bounds[name] ? [sample.bounds[name]] : []
    );
    expect(boxes.length, `${name} was sampled during motion`).toBeGreaterThan(
      5
    );
    expect(
      new Set(boxes.map(box => box[1])).size,
      `${name} y is invariant`
    ).toBe(1);
    expect(
      new Set(boxes.map(box => box[3])).size,
      `${name} height is invariant`
    ).toBe(1);
    if (name === 'main' || name === 'header')
      expect(new Set(boxes.map(box => JSON.stringify(box))).size).toBe(1);
  }
  expect(
    new Set(measurement.samples.map(sample => JSON.stringify(sample.scroll)))
      .size
  ).toBe(1);
  const intervals = measurement.samples
    .slice(1)
    .map((sample, i) => sample.time - measurement.samples[i].time)
    .sort((a, b) => a - b);
  const metrics = {
    frames: measurement.samples.length,
    intervalMedianMs: intervals[Math.floor(intervals.length / 2)],
    intervalP95Ms: intervals[Math.floor(intervals.length * 0.95)],
    intervalMaxMs: intervals.at(-1),
    framesOver60HzBudget: intervals.filter(value => value > 16.7).length,
    framesOver120HzBudget: intervals.filter(value => value > 8.3).length,
    longTaskCount: measurement.tasks.filter(task => task.duration > 50).length,
    longestTaskMs: Math.max(0, ...measurement.tasks.map(task => task.duration)),
    attribution:
      'Browser-document timing on a shared busy host; task entries do not identify sidebar ownership. This display is not a physical 120Hz receipt.',
  };
  await info.attach('rail-performance-summary', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
  await info.attach('rail-frame-measurement', {
    body: JSON.stringify(measurement),
    contentType: 'application/json',
  });
});

for (const operator of [false, true]) {
  test(`touch ${operator ? 'Ovie' : 'Jovie'} controls provide 44px targets`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 700 },
    });
    const page = await context.newPage();
    try {
      await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
      expect(
        await page.evaluate(() => matchMedia('(pointer:coarse)').matches)
      ).toBe(true);
      const expand = page.getByRole('button', {
        name: 'Expand sidebar',
        exact: true,
      });
      const target = await expand.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(target!.height).toBeGreaterThanOrEqual(44);
      await expand.tap();
      const drawer = page.locator(
        '[data-sidebar="sidebar"][data-mobile="true"]'
      );
      const home = drawer.getByRole('link', {
        name: operator ? 'Now' : 'Home',
        exact: true,
      });
      expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await drawer
        .getByRole('button', { name: operator ? 'More Pages' : 'Recent Chats' })
        .tap();
      const popup = drawer.locator(
        `[data-sidebar-flyout="${operator ? 'more' : 'recent'}"]`
      );
      if (operator) {
        const pin = popup.getByRole('menuitem', {
          name: 'Pin Chat',
          exact: true,
        });
        expect((await pin.boundingBox())!.width).toBeGreaterThanOrEqual(44);
        expect((await pin.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(
          (await popup
            .getByRole('menuitem', { name: 'Chat', exact: true })
            .boundingBox())!.height
        ).toBeGreaterThanOrEqual(44);
      } else {
        expect(
          (await popup
            .getByRole('link', { name: 'All chats', exact: true })
            .boundingBox())!.height
        ).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await context.close();
    }
  });
}

test('phone Find a page closes the drawer and searches only permitted Ovie pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const publicReads: string[] = [];
  page.on('request', request => {
    if (
      /\/api\/(chat\/conversations|spotify\/search|dashboard\/releases|chat\/capabilities)/.test(
        request.url()
      )
    )
      publicReads.push(request.url());
  });
  await page.goto(story(true), { waitUntil: 'domcontentloaded' });
  const expand = page.getByRole('button', {
    name: 'Expand sidebar',
    exact: true,
  });
  await expand.click();
  await page.getByRole('button', { name: 'More Pages', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Find a page…', exact: true })
    .click();
  await expect(
    page.locator('[data-sidebar="sidebar"][data-mobile="true"]')
  ).toBeHidden();
  const search = page.getByRole('combobox', { name: 'Command Palette Search' });
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('placeholder', 'Find a page…');
  await search.fill('People');
  await expect(
    page.getByRole('option').filter({ hasText: 'People' }).first()
  ).toBeVisible();
  await expect(
    page.locator('[data-palette-section="recent-chats"]')
  ).toHaveCount(0);
  await expect(
    page.locator('[data-palette-section="workspace-actions"]')
  ).toHaveCount(0);
  expect(publicReads).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(expand).toBeFocused();
});

test('Ovie Recent reads the private Summer door and resumes its existing conversation', async ({
  page,
}) => {
  const publicReads: string[] = [];
  page.on('request', request => {
    if (/\/api\/chat\/conversations/.test(request.url()))
      publicReads.push(request.url());
  });
  await page.goto(story(true), { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: 'Recent Chats', exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    const prior = (
      window as unknown as {
        __jovieApiMock?: (request: { url: URL }) => Response | undefined;
      }
    ).__jovieApiMock;
    Object.assign(window, {
      __jovieApiMock: (request: { url: URL }) =>
        request.url.pathname === '/api/ovie/summer/history'
          ? Response.json({
              chatMode: 'ov',
              conversation: { id: 'summer-session:current', title: 'Summer' },
              messages: [
                {
                  id: 'private-fixture',
                  role: 'assistant',
                  content: 'Private transcript fixture',
                  createdAt: new Date().toISOString(),
                  clientMessageId: null,
                },
              ],
              hasMore: false,
            })
          : prior?.(request),
    });
  });
  await page.getByRole('button', { name: 'Recent Chats', exact: true }).click();
  const recent = page.locator('[data-sidebar-flyout="recent"]');
  await expect(
    recent.getByRole('link', { name: 'Summer', exact: true })
  ).toBeVisible();
  await expect(recent).not.toContainText('Private transcript fixture');
  await expect(
    recent.getByRole('link', { name: 'All chats', exact: true })
  ).toHaveAttribute('href', '/app/ov/chat');
  expect(publicReads).toEqual([]);
});

for (const operator of [false, true]) {
  test(`effective 200% layout zoom keeps ${operator ? 'Ovie' : 'Jovie'} navigation reachable`, async ({
    browser,
    baseURL,
  }) => {
    // A 1440x900 physical viewport at 200% exposes 720x450 CSS pixels.
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 720, height: 450 },
      deviceScaleFactor: 2,
    });
    try {
      const page = await context.newPage();
      await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
      await page
        .getByRole('button', { name: 'Expand sidebar', exact: true })
        .click();
      const drawer = page.locator(
        '[data-sidebar="sidebar"][data-mobile="true"]'
      );
      await expect(drawer.locator('[data-sidebar="footer"]')).toBeInViewport();
      await drawer
        .getByRole('button', {
          name: operator ? 'More Pages' : 'Recent Chats',
          exact: true,
        })
        .click();
      const popup = page.locator(
        `[data-sidebar-flyout="${operator ? 'more' : 'recent'}"]`
      );
      const box = await popup.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(244);
      expect(box!.y + box!.height).toBeLessThanOrEqual(450);
      await expect(
        popup.getByRole(operator ? 'menuitem' : 'button', {
          name: 'Back',
          exact: true,
        })
      ).toBeInViewport();
    } finally {
      await context.close();
    }
  });
}

test('long Recent labels remain bounded with a large real-schema conversation fixture', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--long-recent-shell&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  await page.getByRole('button', { name: 'Recent Chats', exact: true }).click();
  const recent = page.locator('[data-sidebar-flyout="recent"]');
  const rows = recent
    .getByRole('link')
    .filter({ hasText: 'A long conversation title' });
  await expect(rows).toHaveCount(5);
  expect(
    await recent.evaluate(element => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  await expect(
    recent.getByRole('link', { name: 'All chats', exact: true })
  ).toBeInViewport();
  await expect(
    recent.getByRole('status', { name: 'Running', exact: true })
  ).toBeVisible();
  await expect(
    recent.getByRole('status', { name: 'Error', exact: true })
  ).toBeVisible();
});

test('More keeps the complete permitted operator collection reachable at short height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.goto(story(true), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'More Pages', exact: true }).click();
  const menu = page.locator('[data-sidebar-flyout="more"]');
  expect(
    await menu.locator('[role="menuitem"][href]').count()
  ).toBeLessThanOrEqual(12);
  expect(
    await menu.evaluate(element => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  await menu
    .getByRole('menuitem', { name: 'Find a page…', exact: true })
    .click();
  const search = page.getByRole('combobox', { name: 'Command Palette Search' });
  const pages = await page.evaluate(
    () =>
      (window as unknown as { sidebarFixturePages: { label: string }[] })
        .sidebarFixturePages
  );
  expect(pages.length).toBeGreaterThan(15);
  for (const item of pages) {
    await search.fill(item.label);
    await expect(
      page.getByRole('option').filter({ hasText: item.label }).first()
    ).toBeVisible();
  }
});

test('attention, audio and the inspector coexist without moving the account or losing a draft', async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.desktopRuntime = 'electron';
    });
    const available: (() => void)[] = [],
      downloaded: (() => void)[] = [];
    Object.assign(window, {
      electronAPI: {
        platform: 'darwin',
        electronVersion: '44.5.1',
        onUpdateAvailable: (callback: () => void) => {
          available.push(callback);
          return () => {};
        },
        onUpdateDownloaded: (callback: () => void) => {
          downloaded.push(callback);
          return () => {};
        },
        installUpdateAndRestart: () => {
          throw new Error('A draft must prevent install');
        },
        goBack: async () => {},
        goForward: async () => {},
        onNavStateChanged: () => () => {},
        setWorkState: () => {},
      },
      fireFixtureUpdate: () => {
        available.forEach(callback => callback());
        downloaded.forEach(callback => callback());
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--inspector-media-shell&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  const footer = page.locator('[data-sidebar="footer"]');
  const account = page.getByTestId('sidebar-identity-group');
  await expect(account).toBeVisible();
  const footerBefore = await footer.boundingBox();
  const accountBefore = await account.boundingBox();
  await page.getByRole('button', { name: 'Load sample track' }).click();
  await page.getByRole('button', { name: 'Hide Player', exact: true }).click();
  const withAudio = await account.boundingBox();
  await page.evaluate(() =>
    (window as unknown as { fireFixtureUpdate: () => void }).fireFixtureUpdate()
  );
  const update = page
    .getByTestId('update-available-pill')
    .filter({ visible: true });
  await expect(update).toBeVisible();
  expect(await account.boundingBox()).toEqual(withAudio);
  await update.click();
  await expect(update).toHaveAccessibleName('Save work first');
  const input = page.getByTestId('chat-composer-surface').locator('textarea');
  await expect(input).toHaveValue('A saved release draft');
  await expect(page.getByTestId('sidebar-inspector-fixture')).toBeVisible();
  expect(accountBefore!.y).toBeGreaterThanOrEqual(footerBefore!.y);
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  await expect(
    page.locator(
      '[data-shell-audio-surface="sidebar-compact"][data-state="visible"]'
    )
  ).toBeVisible();
  await expect(input).toHaveValue('A saved release draft');
});

test('large permitted page fixture stays bounded and keyboard reachable', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.goto(
    '/iframe.html?id=organisms-unifiedsidebar--large-more-shell&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  const trigger = page.getByRole('button', { name: 'More Pages', exact: true });
  await expect(trigger).toBeVisible();
  const profiler = await page.context().newCDPSession(page);
  await profiler.send('Profiler.enable');
  await profiler.send('Profiler.start');
  await page.evaluate(() => {
    (
      window as unknown as { sidebarScaleRenderSamples: unknown[] }
    ).sidebarScaleRenderSamples = [];
    const target = window as unknown as {
      sidebarScaleTasks: { duration: number; start: number }[];
      sidebarScaleObserver: PerformanceObserver;
    };
    target.sidebarScaleTasks = [];
    const flow = window as unknown as ScaleFlowWindow;
    flow.sidebarFlowMarks = [{ phase: 'more', time: performance.now() }];
    flow.sidebarFlowFrames = [];
    flow.sidebarPaletteRenderSamples = [];
    const sample = (time: number) => {
      flow.sidebarFlowFrames.push(time);
      flow.sidebarFlowRaf = requestAnimationFrame(sample);
    };
    flow.sidebarFlowRaf = requestAnimationFrame(sample);
    target.sidebarScaleObserver = new PerformanceObserver(entries => {
      target.sidebarScaleTasks.push(
        ...entries
          .getEntries()
          .map(entry => ({ duration: entry.duration, start: entry.startTime }))
      );
    });
    target.sidebarScaleObserver.observe({ type: 'longtask', buffered: false });
  });
  const started = await page.evaluate(() => performance.now());
  await trigger.focus();
  await trigger.press('Enter');
  const menu = page.locator('[data-sidebar-flyout="more"]');
  const rows = menu.getByRole('menuitem');
  await expect(rows).toHaveCount(13);
  const opened = await page.evaluate(() => performance.now());
  await page.keyboard.press('End');
  await expect(rows.last()).toBeFocused();
  await expect(rows.last()).toBeInViewport();
  await expect(rows.last()).toHaveAttribute('href', '/app/calendar');
  const bounds = await menu.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(450);
  expect(
    await menu.evaluate(element => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  const renders = await page.evaluate(
    () =>
      (
        window as unknown as {
          sidebarScaleRenderSamples: { phase: string; duration: number }[];
        }
      ).sidebarScaleRenderSamples
  );
  expect(renders.length).toBeGreaterThan(0);
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  const longTasks = await page.evaluate(() => {
    const target = window as unknown as {
      sidebarScaleTasks: { duration: number; start: number }[];
      sidebarScaleObserver: PerformanceObserver;
    };
    return target.sidebarScaleTasks;
  });
  await info.attach('large-page-opening-timing', {
    body: JSON.stringify(
      {
        count: 120,
        inlinePages: 12,
        longTasks,
        eventToAssertionMs: opened - started,
        renders,
        budgetsMs: { sixtyHz: 16.7, oneTwentyHz: 8.3, longTask: 50 },
        scope:
          'Storybook React Profiler actual render duration; opening wall time includes browser automation. Not physical 120Hz or native proof.',
      },
      null,
      2
    ),
    contentType: 'application/json',
  });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await page.evaluate(() => {
    (window as unknown as ScaleFlowWindow).sidebarFlowMarks.push({
      phase: 'search-open',
      time: performance.now(),
    });
  });
  await menu
    .getByRole('menuitem', { name: 'Find a page…', exact: true })
    .click();
  const search = page.getByRole('combobox', { name: 'Command Palette Search' });
  await expect(search).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { sidebarFixturePages: unknown[] })
          .sidebarFixturePages.length
    )
  ).toBe(120);
  await page.evaluate(() => {
    (window as unknown as ScaleFlowWindow).sidebarFlowMarks.push({
      phase: 'search-query',
      time: performance.now(),
    });
  });
  await search.fill('Calendar page fixture 120');
  await expect(
    page
      .getByRole('option')
      .filter({ hasText: 'Calendar page fixture 120:' })
      .first()
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as ScaleFlowWindow).sidebarFlowMarks.push({
      phase: 'selection',
      time: performance.now(),
    });
  });
  await search.press('Enter');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { sidebarFixtureNavigation: () => string[][] })
          .sidebarFixtureNavigation()
          .at(-1)?.[0]
    )
  ).toBe('/app/calendar');
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  const flow = await page.evaluate(() => {
    const target = window as unknown as ScaleFlowWindow;
    target.sidebarScaleObserver.disconnect();
    cancelAnimationFrame(target.sidebarFlowRaf);
    return {
      marks: target.sidebarFlowMarks,
      frames: target.sidebarFlowFrames,
      tasks: target.sidebarScaleTasks,
      paletteRenders: target.sidebarPaletteRenderSamples,
    };
  });
  const { profile } = await profiler.send('Profiler.stop');
  await info.attach('large-page-cpu-profile', {
    body: JSON.stringify(profile),
    contentType: 'application/json',
  });
  await profiler.detach();
  await info.attach('large-page-complete-flow', {
    body: JSON.stringify(flow),
    contentType: 'application/json',
  });
  await trigger.focus();
  await trigger.press('Enter');
  await page.keyboard.press('End');
  await expect(rows.last()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('large-more-end.png') });
});
