import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

test.use({
  storageState: { cookies: [], origins: [] },
  video: 'off',
  trace: 'off',
});

async function enterProfileSettings(page: Page, desktop = true) {
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
  if (!desktop) return;
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
        overflowingElements: [
          ...elements.column[0].querySelectorAll<HTMLElement>('*'),
        ]
          .filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              (rect.right > column.right + 1 || rect.left < column.left - 1)
            );
          })
          .slice(0, 30)
          .map(element => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              id: element.id,
              className: element.className,
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          }),
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
  if (process.env.PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES !== 'false') {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
  // Numeric geometry is safe durable evidence even when the existing hosted
  // artifact policy rejects Playwright's automatic error-context Markdown.
  process.stdout.write(
    `${JSON.stringify({ name, sampleCount: samples.length, first: samples[0], last: result })}\n`
  );
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
  await expect(
    page.locator('[data-app-shell-frame="true"]:visible')
  ).toHaveCount(1);
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

async function assertMobileEditorAvailable(page: Page) {
  const rail = page.locator('#shell-artist-profile-rail');
  await expect(rail).toHaveAttribute('aria-hidden', 'true');
  await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  const opener = page.getByRole('button', {
    name: 'Open Links And Music Preview Panel',
  });
  await expect(opener).toHaveCount(1);
  await opener.click({ trial: true });
  const field = page.locator('#displayName');
  await field.click();
  await expect(field).toBeFocused();
  // A ready document alone does not prove the opener's mount effect has run.
  // Keep the field focused through a bounded idle window and late renders.
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
  await expect(
    page.getByRole('dialog', { name: 'Profile Preview' })
  ).toHaveCount(0);
  await expect(rail).toHaveAttribute('aria-hidden', 'true');
  expect(
    await field.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return (
        document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        ) === element
      );
    })
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
}

for (const width of [390, 768, 1023]) {
  test(`${width}px mobile preview requires intent and restores the editor`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await enterProfileSettings(page, false);
    await assertMobileEditorAvailable(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertMobileEditorAvailable(page);
    const field = page.locator('#displayName');
    const originalValue = await field.inputValue();
    const opener = page.getByRole('button', {
      name: 'Open Links And Music Preview Panel',
    });
    const rail = page.locator('#shell-artist-profile-rail');
    for (const dismissal of ['button', 'Escape'] as const) {
      await opener.focus();
      await opener.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Profile Preview' });
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(rail).toHaveAttribute('data-rail-phase', 'open');
      await expect
        .poll(() =>
          dialog.evaluate(element => element.contains(document.activeElement))
        )
        .toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(
        await dialog.evaluate(element =>
          element.contains(document.activeElement)
        )
      ).toBe(true);
      await page.keyboard.press('Tab');
      expect(
        await dialog.evaluate(element =>
          element.contains(document.activeElement)
        )
      ).toBe(true);
      expect(
        await field.evaluate(element =>
          Boolean(element.closest('[inert], [aria-hidden="true"]'))
        )
      ).toBe(true);
      expect(
        await dialog.evaluate(
          element => element.scrollWidth - element.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      if (process.env.PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES !== 'false') {
        await page.screenshot({
          path: testInfo.outputPath(`mobile-${width}-${dismissal}.png`),
        });
      }
      const close = dialog.getByRole('button', { name: 'Close', exact: true });
      await expect(close).toBeVisible();
      await close.click({ trial: true });
      if (dismissal === 'button') await close.click();
      else await page.keyboard.press('Escape');
      await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await assertMobileEditorAvailable(page);
      await expect(field).toHaveValue(originalValue);
    }
  });
}

test('desktop companion does not become an unsolicited mobile modal on resize', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterProfileSettings(page);
  await assertOpenPane(page, testInfo, 'desktop-before-shrink');
  const field = page.locator('#displayName');
  await field.focus();
  const transition = await page.evaluateHandle(() => {
    const samples: { modal: boolean; focus: string | null }[] = [];
    let frame = 0;
    const sample = () => {
      samples.push({
        modal: Boolean(
          document.querySelector(
            '#shell-artist-profile-rail[role="dialog"][aria-modal="true"][aria-hidden="false"]'
          )
        ),
        focus: document.activeElement?.id ?? null,
      });
      frame = requestAnimationFrame(sample);
    };
    sample();
    return {
      stop: () => {
        cancelAnimationFrame(frame);
        return samples;
      },
    };
  });
  for (const width of [1023, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#shell-artist-profile-rail')).toHaveAttribute(
      'data-rail-phase',
      'closed'
    );
    // Assert before any click/focus helper can repair a lost focus target.
    await expect(field).toBeFocused();
    await assertMobileEditorAvailable(page);
  }
  const samples = await transition.evaluate(observer => observer.stop());
  await transition.dispose();
  await testInfo.attach('responsive-modal-frames.json', {
    body: JSON.stringify(samples),
    contentType: 'application/json',
  });
  expect(
    samples.some(sample => sample.modal),
    'no painted unsolicited modal during resize'
  ).toBe(false);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(
    page.getByRole('dialog', { name: 'Profile Preview' })
  ).toHaveCount(0);
  await expect(page.locator('#shell-artist-profile-rail')).toHaveAttribute(
    'data-rail-phase',
    'open'
  );
  await assertOpenPane(page, testInfo, 'desktop-after-grow');
  const rail = page.locator('#shell-artist-profile-rail');
  const railAction = rail.getByRole('button').first();
  await expect(railAction).toBeVisible();
  await railAction.focus();
  expect(
    await rail.evaluate(element => element.contains(document.activeElement))
  ).toBe(true);
  await page.setViewportSize({ width: 1023, height: 900 });
  await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  await expect(
    page.getByRole('button', { name: 'Open Links And Music Preview Panel' })
  ).toBeFocused();
  await assertMobileEditorAvailable(page);
});

for (const width of [1024, 1025, 1100, 1280, 1440]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`${width}px ${reducedMotion}: Profile pane closes, reopens and remains reachable`, async ({
      page,
    }, testInfo) => {
      const colorScheme = reducedMotion === 'reduce' ? 'light' : 'dark';
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme,
        reducedMotion,
      });
      await page.addInitScript(theme => {
        localStorage.setItem('jovie-theme', theme);
      }, colorScheme);
      await enterProfileSettings(page);
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${colorScheme}\\b`)
      );
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
  await page.getByRole('link', { name: 'Account', exact: true }).click();
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

test('manual preview control keeps its pointer target and restores rail focus', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterProfileSettings(page);
  const toggle = page.getByTestId('artist-profile-rail-toggle');
  await toggle.click();
  const rail = page.locator('#shell-artist-profile-rail');
  await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  await page.locator('#displayName').focus();
  await page.mouse.move(10, 10);
  const before = (await toggle.boundingBox())!;
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2
  );
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        let frames = 0;
        const sample = () => {
          if (++frames >= 60) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      })
  );
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('data-rail-pinned', 'false');
  const after = (await toggle.boundingBox())!;
  process.stdout.write(
    `${JSON.stringify({ name: 'hover-target', before, after })}\n`
  );
  expect(
    Math.abs(after.x - before.x),
    'hover must not move its own hit target'
  ).toBeLessThanOrEqual(1);
  await assertFullSettingsPane(page);
  // Click the original pointer coordinate. A locator could follow the moving
  // button and conceal the actual failed interaction.
  await page.mouse.click(
    before.x + before.width / 2,
    before.y + before.height / 2
  );
  await expect(toggle).toHaveAttribute('data-rail-pinned', 'true');
  await expect(rail).toHaveAttribute('data-rail-phase', 'open');
  await assertOpenPane(page, testInfo, 'pointer-pinned');
  const railAction = rail.getByRole('button').first();
  await railAction.focus();
  await expect(railAction).toBeFocused();
  await page.keyboard.press(']');
  await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await assertFullSettingsPane(page);
});

test('pending automatic opening reserves the same pane before hydration', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => {
    releaseScripts = resolve;
  });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto(
      `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.SETTINGS_PROFILE)}`,
      { waitUntil: 'commit' }
    );
    const column = page.locator('[data-settings-layout-column="true"]:visible');
    await expect(column).toHaveCount(1);
    await expect(
      column.locator('[data-settings-companion-rail="true"]')
    ).toHaveCount(1);
    const before = (await column.boundingBox())!;
    if (process.env.PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES !== 'false') {
      await page.screenshot({
        path: testInfo.outputPath('pending-opening.png'),
      });
    }
    releaseScripts();
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#shell-artist-profile-rail')).toHaveAttribute(
      'data-rail-phase',
      'open'
    );
    const after = (await column.boundingBox())!;
    process.stdout.write(
      `${JSON.stringify({ name: 'startup-reservation', before, after })}\n`
    );
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    await assertOpenPane(page, testInfo, 'hydrated');
    if (process.env.PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES !== 'false') {
      await page.screenshot({
        path: testInfo.outputPath('automatic-open.png'),
      });
    }
  } finally {
    releaseScripts();
  }
});

test('unrelated Shop completion preserves the same editor and nonzero scroll', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let releaseShop!: () => void;
  const shopReady = new Promise<void>(resolve => {
    releaseShop = resolve;
  });
  let requested = false;
  await page.route('**/api/dashboard/shop', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    requested = true;
    await shopReady;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ shopifyUrl: null }),
    });
  });
  try {
    await enterProfileSettings(page);
    await expect.poll(() => requested).toBe(true);
    const field = page.locator('#displayName');
    const original = (await field.elementHandle())!;
    await field.focus();
    await field.evaluate((element: HTMLInputElement) => {
      element.setSelectionRange(1, Math.min(4, element.value.length));
      element.closest('[data-testid="settings-shell-content"]')!.scrollTop = 64;
    });
    const snapshot = () =>
      field.evaluate((element: HTMLInputElement) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        start: element.selectionStart,
        end: element.selectionEnd,
        scroll: element.closest('[data-testid="settings-shell-content"]')!
          .scrollTop,
      }));
    const before = await snapshot();
    expect(before.scroll).toBeGreaterThan(0);
    releaseShop();
    await expect(
      page.getByRole('status', { name: 'Loading Shop Settings' })
    ).toHaveCount(0);
    const after = await snapshot();
    await expect(field).toBeFocused();
    expect(
      await original.evaluate(
        element => element === document.querySelector('#displayName')
      )
    ).toBe(true);
    expect(after).toEqual(before);
    process.stdout.write(
      `${JSON.stringify({ name: 'shop-completion', before, after })}\n`
    );
    await assertOpenPane(page, testInfo, 'shop-loaded');
  } finally {
    releaseShop();
  }
});
