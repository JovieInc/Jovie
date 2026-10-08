import { expect, type Page, test } from '@playwright/test';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from '@/components/shell/rail-motion';
import {
  detectReversibleControl,
  type ReversibleActivation,
} from '../utils/reversible-control-detector';
import { inspectShellMaterial } from './utils/shell-material-detector';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1440, height: 900 },
});

// Reuse the existing detector with ten COMPLETE cycles, mixing activation
// methods. Hidden staged controls are mounted but never logical actions.
const sequence: ReversibleActivation[] = Array.from(
  { length: 20 },
  (_, index) => (index % 3 === 0 ? 'keyboard' : 'pointer')
);
const controls = (page: Page, side: 'left' | 'right') =>
  page
    .locator(`[data-rail-toggle="${side}"]:not([inert] *)`)
    .filter({ visible: true });

async function certify(page: Page, side: 'left' | 'right') {
  const toggle = controls(page, side);
  const count = await toggle.count();
  if (count !== 1)
    throw new Error(`expected one logical ${side} rail action, found ${count}`);
  const initial =
    (await toggle.getAttribute('aria-expanded')) === 'true' ? 'open' : 'closed';
  return detectReversibleControl({
    name: `real composed ${side} rail`,
    states: initial === 'open' ? ['open', 'closed'] : ['closed', 'open'],
    activationSequence: sequence,
    observe: async () => ({
      pinned:
        side === 'left'
          ? await page
              .locator('#shell-left-rail')
              .getAttribute('data-rail-pinned')
          : null,
      preview: await page
        .locator(`[data-rail-preview-region="${side}"]`)
        .getAttribute('data-rail-preview'),
      state:
        (await controls(page, side).getAttribute('aria-expanded')) === 'true'
          ? 'open'
          : 'closed',
    }),
    activate: async via => {
      if (via === 'pointer') await controls(page, side).click();
      else await controls(page, side).press(side === 'left' ? '[' : ']');
      const movingRail = page
        .locator(
          side === 'left'
            ? '[data-state][data-rail-phase]'
            : '[data-testid="app-shell-right-rail"] [data-rail-phase]'
        )
        .first();
      await expect(movingRail).toHaveAttribute(
        'data-rail-phase',
        /^(open|closed)$/
      );
    },
    assertContinuity: async () => {
      const count = await controls(page, side).count();
      if (count !== 1)
        throw new Error(
          `expected one logical ${side} rail action, found ${count}`
        );
      await expect(controls(page, side)).toBeEnabled();
      await expect(page.locator('[data-app-shell-frame]')).toHaveAttribute(
        'data-quality-probe',
        'mounted'
      );
    },
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(
    '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app',
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator('[data-app-shell-frame]')).toBeVisible();
  await waitForHydration(page);
  await expect(
    page.getByRole('textbox', { name: 'Notes', exact: true })
  ).toBeVisible();
  await expect(controls(page, 'left')).toHaveCount(1);
  await page
    .locator('[data-app-shell-frame]')
    .evaluate(element => element.setAttribute('data-quality-probe', 'mounted'));
});

test('composed browser rails survive ten complete mixed-input cycles, preserve drafts, and reject duplicate actions', async ({
  page,
}, testInfo) => {
  await certify(page, 'left');
  await certify(page, 'right');
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  await notes.fill('Shell regression draft [ ]');
  const before = await controls(page, 'left').getAttribute('aria-expanded');
  await notes.press('ControlOrMeta+b');
  await notes.press('[');
  await expect(controls(page, 'left')).toHaveAttribute(
    'aria-expanded',
    before!
  );
  await expect(notes).toHaveValue('Shell regression draft [ ][');

  // Deliberate-red fixture proves the same composed detector rejects the
  // escaped duplicated toggle; a source mock cannot make this pass.
  await controls(page, 'left').evaluate(element => {
    const duplicate = element.cloneNode(true) as HTMLElement;
    duplicate.setAttribute('data-quality-duplicate', 'true');
    element.parentElement?.append(duplicate);
  });
  await expect(certify(page, 'left')).rejects.toThrow(
    'expected one logical left rail action, found 2'
  );
  await page
    .locator('[data-quality-duplicate]')
    .evaluate(element => element.remove());
  await page.screenshot({
    path: testInfo.outputPath('shell-controls-after.png'),
  });
  await testInfo.attach('after', {
    path: testInfo.outputPath('shell-controls-after.png'),
    contentType: 'image/png',
  });
});

test('held shortcuts toggle once and reduced motion settles immediately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const before = await controls(page, 'left').getAttribute('aria-expanded');
  await controls(page, 'left').focus();
  await page.keyboard.down('[');
  await page.keyboard.down('[');
  await page.keyboard.up('[');
  await expect(controls(page, 'left')).toHaveAttribute(
    'aria-expanded',
    before === 'true' ? 'false' : 'true'
  );
  await expect(
    page.locator('[data-state][data-rail-phase]').first()
  ).toHaveAttribute('data-rail-phase', before === 'true' ? 'closed' : 'open');
});

test('rapid reversals preserve final intent, attachment and inspector scroll geometry', async ({
  page,
}) => {
  const right = controls(page, 'right');
  await right.click();
  const rail = page.locator(
    '[data-testid="app-shell-right-rail"] [data-rail-phase]'
  );
  await expect(rail).toHaveAttribute('data-rail-phase', 'open');
  const inner = rail.locator(':scope > div');
  const width = await inner.evaluate(
    element => element.getBoundingClientRect().width
  );
  const snapshot = await rail.evaluate(element => ({
    scroll: element.scrollTop,
    height: element.scrollHeight,
  }));
  // Input lands during motion; do not wait for a phase to settle between
  // requests. Ten complete alternating keyboard cycles end open.
  for (let index = 0; index < 20; index++) {
    await right.press(']');
    expect(
      await inner.evaluate(element => element.getBoundingClientRect().width)
    ).toBeCloseTo(width, 1);
  }
  await expect(rail).toHaveAttribute('data-rail-phase', 'open');
  await expect(right).toHaveAttribute('aria-expanded', 'true');
  const final = await rail.evaluate(element => ({
    scroll: element.scrollTop,
    height: element.scrollHeight,
  }));
  expect(final).toEqual(snapshot);
  await expect(page.locator('[data-app-shell-frame]')).toHaveAttribute(
    'data-quality-probe',
    'mounted'
  );
});

for (const side of ['left', 'right'] as const) {
  test(`${side} hover and focus preview preserves allocation and saved pinning for ten cycles`, async ({
    page,
  }, testInfo) => {
    if ((await controls(page, side).getAttribute('aria-expanded')) === 'true')
      await controls(page, side).click();
    await expect(
      page
        .locator(
          side === 'left'
            ? '#shell-left-rail'
            : '[data-testid="app-shell-right-rail"] [data-rail-phase]'
        )
        .first()
    ).toHaveAttribute('data-rail-phase', 'closed');
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
    await notes.focus();
    await page.mouse.move(700, 450);
    const plane = page.locator('main#main-content');
    const initial = await plane.boundingBox();
    const cookies = (await page.context().cookies()).filter(
      c => c.name === 'sidebar:state'
    );
    const inspector = page.locator(
      side === 'left'
        ? '#shell-left-rail [data-sidebar="sidebar"]'
        : '#shell-artist-profile-rail'
    );
    for (let cycle = 0; cycle < 10; cycle++) {
      await controls(page, side).hover();
      await expect(controls(page, side)).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await expect(controls(page, side)).toHaveAccessibleName(/Pin /);
      await expect(notes).toBeFocused();
      await expect.poll(async () => plane.boundingBox()).toEqual(initial);
      await inspector.hover({ position: { x: 100, y: 100 } });
      await expect(controls(page, side)).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await page.mouse.move(700, 450);
      await expect(controls(page, side)).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await expect.poll(async () => plane.boundingBox()).toEqual(initial);
    }
    expect(
      (await page.context().cookies()).filter(c => c.name === 'sidebar:state')
    ).toEqual(cookies);
    // Focus is equivalent access; explicit toggle pins the preview.
    await controls(page, side).focus();
    await expect(controls(page, side)).toHaveAccessibleName(/Pin /);
    await controls(page, side).press('Enter');
    await expect(controls(page, side)).toHaveAccessibleName(
      side === 'left' ? 'Collapse sidebar' : /Hide .* profile/
    );
    await page.mouse.move(700, 450);
    await page.waitForTimeout(SHELL_RAIL_PREVIEW_GRACE_MS + 30);
    await expect(controls(page, side)).toHaveAttribute('aria-expanded', 'true');
    await testInfo.attach(`${side}-preview-after`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('rendered Home material detector rejects a deliberate inset seam', async ({
  page,
}, testInfo) => {
  const report = await inspectShellMaterial(page);
  expect(report.plane).not.toBeNull();
  expect(report.findings).toEqual([]);
  await page.locator('main#main-content').evaluate(element => {
    const seam = document.createElement('div');
    seam.dataset.qualityMaterialSeam = 'true';
    seam.style.cssText =
      'position:absolute;top:100px;left:0;width:100%;height:100px;background:rgb(255,0,0);';
    element.append(seam);
  });
  const red = await inspectShellMaterial(page);
  expect(red.findings.length).toBeGreaterThan(0);
  await page
    .locator('[data-quality-material-seam]')
    .evaluate(element => element.remove());
  await testInfo.attach('material-report', {
    body: JSON.stringify({ baseline: report, deliberateRed: red }),
    contentType: 'application/json',
  });
});

test('route navigation keeps the shell attached and inspects rendered materials in both themes', async ({
  page,
}, testInfo) => {
  const reports: unknown[] = [];
  for (const theme of ['dark', 'light']) {
    await page.evaluate(
      value =>
        document.documentElement.classList.toggle('dark', value === 'dark'),
      theme
    );
    for (const [name, pathname] of [
      ['New Chat', '/app/chat'],
      ['Profiles', '/app/presence'],
      ['Work', '/app/library'],
      ['Home', '/app'],
    ] as const) {
      await page.getByRole('link', { name, exact: true }).click();
      await page.waitForURL(url => url.pathname === pathname);
      await expect(
        page.getByRole('heading', { name, exact: true }).first()
      ).toBeVisible();
      await expect(page.locator('[data-app-shell-frame]')).toHaveAttribute(
        'data-quality-probe',
        'mounted'
      );
      await expect(page.locator('main#main-content')).toBeVisible();
      reports.push({
        theme,
        route: new URL(page.url()).pathname,
        material: await inspectShellMaterial(page),
      });
    }
  }
  await testInfo.attach('route-material-matrix', {
    body: JSON.stringify(reports),
    contentType: 'application/json',
  });
});

test('chat profile stays mounted through closed, opening and interrupted exits', async ({
  page,
}, testInfo) => {
  await page.getByRole('link', { name: 'New Chat', exact: true }).click();
  // E2E chat intentionally disables this surface unless its existing
  // profile fixture parameter is set; production enables it by default.
  await page.goto('/app/chat?panel=profile');
  await expect(
    page.getByRole('heading', { name: 'New Chat', exact: true })
  ).toBeVisible();
  await page
    .locator('[data-app-shell-frame]')
    .evaluate(element => element.setAttribute('data-quality-probe', 'mounted'));
  const drawer = page.locator('#shell-artist-profile-rail');
  await expect(drawer).toHaveAttribute('data-rail-phase', 'open');
  await controls(page, 'right').click();
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toHaveAttribute('data-rail-phase', 'closed');
  await expect(controls(page, 'right')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await expect
    .poll(async () =>
      page
        .getByTestId('app-shell-right-rail')
        .evaluate(element => element.getBoundingClientRect().width)
    )
    .toBe(0);
  await drawer.evaluate(element =>
    element.setAttribute('data-quality-profile-probe', 'mounted')
  );
  await certify(page, 'right');
  await expect(drawer).toHaveAttribute('data-quality-profile-probe', 'mounted');
  // Immediate reversals must not replace or discard the drawer subtree.
  for (let index = 0; index < 20; index++) {
    await controls(page, 'right').press(']');
    await expect(drawer).toHaveAttribute(
      'data-quality-profile-probe',
      'mounted'
    );
  }
  await expect(drawer).toHaveAttribute('data-rail-phase', 'closed');
  await testInfo.attach('chat-profile-after', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('resizing through narrow drawers clears stale locks and preserves the desktop pin', async ({
  page,
}, testInfo) => {
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  await expect(controls(page, 'left')).toHaveAttribute('aria-pressed', 'true');
  const savedPin = (await page.context().cookies()).filter(
    cookie => cookie.name === 'sidebar:state'
  );
  await page.setViewportSize({ width: 850, height: 700 });
  // The web narrow adapter uses bottom navigation and the existing sidebar
  // shortcut; its desktop rail control is intentionally hidden.
  await expect(controls(page, 'left')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'More options', exact: true })
  ).toBeVisible();
  await page.getByRole('heading', { name: 'Home', exact: true }).click();
  await page.keyboard.press('[');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await notes.focus();
  await expect(notes).toBeFocused();
  await expect(controls(page, 'left')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 850, height: 700 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(controls(page, 'left')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'More options', exact: true })
  ).toBeVisible();
  const right = controls(page, 'right');
  await right.click();
  const profile = page.locator('#shell-artist-profile-rail');
  await expect(profile).toHaveAttribute('aria-hidden', 'false');
  // Focus the drawer itself so a tooltip is not the top Escape owner.
  await profile.focus();
  await page.keyboard.press('Escape');
  await expect(profile).toHaveAttribute('aria-hidden', 'true');
  await expect(right).toBeFocused();
  await notes.focus();
  await expect(notes).toBeFocused();
  expect(
    (await page.context().cookies()).filter(
      cookie => cookie.name === 'sidebar:state'
    )
  ).toEqual(savedPin);
  await testInfo.attach('narrow-drawers-after', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(controls(page, 'left')).toHaveAttribute('aria-pressed', 'true');
});
