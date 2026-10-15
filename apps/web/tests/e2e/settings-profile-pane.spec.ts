import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

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
          Number(style.opacity) > 0 &&
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
    if (!railMount) return { counts, geometry: null };
    const occupiedRail = box(railMount);
    const fieldRect = elements.field[0].getBoundingClientRect();
    const hit = document.elementFromPoint(
      fieldRect.left + fieldRect.width / 2,
      fieldRect.top + fieldRect.height / 2
    );
    return {
      counts,
      geometry: {
        route,
        pane,
        column,
        field,
        rail,
        occupiedRail,
        relationships: {
          routeContainsPane: elements.route[0].contains(elements.pane[0]),
          paneContainsColumn: elements.pane[0].contains(elements.column[0]),
          columnContainsField: elements.column[0].contains(elements.field[0]),
          sameShell:
            railMount.closest('[data-app-shell-main-content="true"]') ===
            elements.route[0].closest('[data-app-shell-main-content="true"]'),
          fieldHit:
            hit === elements.field[0] || elements.field[0].contains(hit),
        },
        columnOverflow:
          elements.column[0].scrollWidth - elements.column[0].clientWidth,
        paneOverflow:
          elements.pane[0].scrollWidth - elements.pane[0].clientWidth,
        centerDelta: Math.abs(
          (column.left + column.right - pane.left - pane.right) / 2
        ),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      },
    };
  });
}

async function assertOpenPane(page: Page, testInfo: TestInfo, name: string) {
  // Observe a fixed window after the actual rail lifecycle settles. Never
  // poll until the centering assertion passes: a stable wrong layout is RED.
  const samples = [];
  for (let frame = 0; frame < 12; frame += 1) {
    samples.push(await readPaneGeometry(page));
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  const result = samples.at(-1)!;
  const geometryPath = testInfo.outputPath(`${name}.json`);
  await writeFile(geometryPath, JSON.stringify({ samples }, null, 2));
  await testInfo.attach(`${name}.json`, {
    path: geometryPath,
    contentType: 'application/json',
  });
  // Numeric geometry is safe durable evidence even when the existing hosted
  // artifact policy rejects Playwright's automatic error-context Markdown.
  process.stdout.write(`${JSON.stringify({ name, samples })}\n`);
  expect(result.counts).toEqual({
    route: 1,
    pane: 1,
    column: 1,
    field: 1,
    rail: 1,
  });
  expect(result.geometry).not.toBeNull();
  const geometry = result.geometry!;
  expect(geometry.relationships).toEqual({
    routeContainsPane: true,
    paneContainsColumn: true,
    columnContainsField: true,
    sameShell: true,
    fieldHit: true,
  });
  for (const sample of samples) {
    expect(sample.counts).toEqual(result.counts);
    expect(sample.geometry).not.toBeNull();
    expect(
      Math.abs(sample.geometry!.column.left - geometry.column.left)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(sample.geometry!.column.right - geometry.column.right)
    ).toBeLessThanOrEqual(1);
  }
  expect(geometry.rail.width).toBeGreaterThanOrEqual(SIDEBAR_WIDTH - 1);
  expect(
    geometry.centerDelta,
    'form centers in the actual usable pane'
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(geometry.pane.left - geometry.route.left)
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      geometry.pane.width - (geometry.occupiedRail.left - geometry.route.left)
    )
  ).toBeLessThanOrEqual(16);
  expect(geometry.occupiedRail.right).toBeGreaterThanOrEqual(
    geometry.route.right
  );
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
  expect(geometry.columnOverflow).toBeLessThanOrEqual(1);
  expect(geometry.paneOverflow).toBeLessThanOrEqual(1);
  return geometry;
}

async function assertFullSettingsPane(page: Page) {
  await expect(page.getByTestId('settings-shell-content')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const route = document.querySelector<HTMLElement>(
      '[data-testid="app-shell-scroll"]'
    )!;
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="settings-shell-content"]'
    )!;
    const column = pane.querySelector<HTMLElement>(
      '[data-settings-layout-column="true"]'
    )!;
    const routeBox = route.getBoundingClientRect();
    const paneBox = pane.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    return {
      leftDelta: Math.abs(paneBox.left - routeBox.left),
      rightDelta: Math.abs(paneBox.right - routeBox.right),
      centerDelta: Math.abs(
        (columnBox.left + columnBox.right - paneBox.left - paneBox.right) / 2
      ),
      overflow: column.scrollWidth - column.clientWidth,
    };
  });
  expect(geometry.leftDelta).toBeLessThanOrEqual(1);
  expect(geometry.rightDelta).toBeLessThanOrEqual(1);
  expect(geometry.centerDelta).toBeLessThanOrEqual(1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
}

async function assertReachable(page: Page) {
  const field = page.locator('#displayName');
  await field.click({ trial: true });
  await field.focus();
  await field.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(0, Math.min(2, element.value.length));
  });
  const before = await field.evaluate((element: HTMLInputElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
    scroll: element.closest('[data-testid="settings-shell-content"]')!
      .scrollTop,
  }));
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        let frames = 0;
        const sample = () => {
          if (++frames >= 120) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      })
  );
  await expect(field).toBeFocused();
  expect(
    await field.evaluate((element: HTMLInputElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      scroll: element.closest('[data-testid="settings-shell-content"]')!
        .scrollTop,
    }))
  ).toEqual(before);
  const visitor = page.getByRole('link', { name: 'View as Visitor' });
  await visitor.click({ trial: true });
  const lastAction = page
    .locator('#artist-profile button:enabled:visible')
    .last();
  await lastAction.click({ trial: true });
  await lastAction.focus();
  await expect(lastAction).toBeFocused();
  expect(
    await lastAction.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      );
      return hit === element || element.contains(hit);
    })
  ).toBe(true);
  await field.scrollIntoViewIfNeeded();
}

test.beforeEach(() => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires the isolated dev-auth E2E lane'
  );
  test.setTimeout(180_000);
});

test('Profile companion leaves one centered usable settings pane', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterProfileSettings(page);
  await assertOpenPane(page, testInfo, 'initial');
});

for (const width of [1024, 1100, 1280, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`${width}px ${reducedMotion}: Profile pane closes, reopens and remains reachable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme: reducedMotion === 'reduce' ? 'light' : 'dark',
        reducedMotion,
      });
      await enterProfileSettings(page);
      await assertOpenPane(page, testInfo, 'opened');
      await assertReachable(page);
      const toggle = page.getByTestId('artist-profile-rail-toggle');
      await expect(toggle).toHaveCount(1);
      await toggle.scrollIntoViewIfNeeded();
      await toggle.focus();
      await toggle.press('Enter');
      const rail = page.locator('#shell-artist-profile-rail');
      await expect(rail).toHaveAttribute('aria-hidden', 'true');
      await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
      await expect(rail).toHaveAttribute('inert', '');
      await expect(toggle).toBeFocused();
      await assertFullSettingsPane(page);
      await assertReachable(page);
      await toggle.scrollIntoViewIfNeeded();
      await toggle.focus();
      await toggle.press('Space');
      await expect(rail).toHaveAttribute('data-rail-phase', 'open');
      await assertOpenPane(page, testInfo, 'reopened');
      await toggle.press('Enter');
      await toggle.press('Enter');
      await expect(rail).toHaveAttribute('data-rail-phase', 'open');
      await assertOpenPane(page, testInfo, 'interrupted');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('#displayName')).toBeVisible();
      await expect(rail).toHaveAttribute('data-rail-phase', 'open');
      await assertOpenPane(page, testInfo, 'reloaded');
    });
  }
}

test('Account keeps its full pane after Profile navigation and browser history', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterProfileSettings(page);
  await assertOpenPane(page, testInfo, 'profile');
  await page.goto(APP_ROUTES.SETTINGS_ACCOUNT, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.SETTINGS_ACCOUNT}$`));
  await assertFullSettingsPane(page);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.SETTINGS_PROFILE}$`));
  await expect(page.locator('#shell-artist-profile-rail')).toHaveAttribute(
    'data-rail-phase',
    'open'
  );
  await assertOpenPane(page, testInfo, 'history-profile');
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.SETTINGS_ACCOUNT}$`));
  await assertFullSettingsPane(page);
});
