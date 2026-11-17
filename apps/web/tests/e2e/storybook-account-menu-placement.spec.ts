import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import {
  OVERLAY_COLLISION_PADDING,
  OVERLAY_SIDE_OFFSET,
} from '../../../../packages/ui/lib/dropdown-styles';

const storyPrefix = 'organisms-userbutton-placement--';
const submenuSelector = '[data-slot="common-dropdown-subcontent"]';

async function openAccount(page: Page, story: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/iframe.html?id=${storyPrefix}${story}&viewMode=story`);
  const trigger = page
    .getByTestId('user-button-loaded')
    .locator('button')
    .first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const rootId = await trigger.getAttribute('aria-controls');
  expect(rootId).toBeTruthy();
  const root = page.locator(`[id="${rootId}"]`);
  await expect(root).toBeVisible();
  await expect(root).toContainText('Casey Example');
  const learn = root.getByRole('menuitem', { name: 'Learn More', exact: true });
  return { trigger, root, learn };
}

async function readGeometry(
  parent: Locator,
  trigger: Locator,
  submenu: Locator
) {
  const parentBox = await parent.boundingBox();
  const row = await trigger.boundingBox();
  const surface = await submenu.boundingBox();
  const first = submenu.getByRole('menuitem').first();
  const firstBox = await first.boundingBox();
  if (!parentBox || !row || !surface || !firstBox)
    throw new Error('Missing menu geometry');
  const labelGeometry = async (item: Locator) =>
    item.evaluate(node => {
      const label = Array.from(node.children).find(
        child => child.tagName === 'SPAN' && child.textContent?.trim()
      );
      if (!label) throw new Error('Missing actual menu label');
      const marker = document.createElement('span');
      marker.style.cssText =
        'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline';
      label.append(marker);
      const baseline = marker.getBoundingClientRect().top;
      marker.remove();
      const box = node.getBoundingClientRect();
      const centerY = box.y + box.height / 2;
      const pieces = Array.from(node.children).map(child => {
        const part = child.getBoundingClientRect();
        return {
          tag: child.tagName,
          text: child.textContent,
          centerDelta: part.y + part.height / 2 - centerY,
        };
      });
      return { baseline, centerY, pieces };
    });
  const sourceLabel = await labelGeometry(trigger);
  const firstLabel = await labelGeometry(first);
  const side = await submenu.getAttribute('data-side');
  return {
    parent: parentBox,
    row,
    surface,
    first: firstBox,
    side,
    gap:
      side === 'left'
        ? parentBox.x - surface.x - surface.width
        : surface.x - parentBox.x - parentBox.width,
    baselineDelta: firstLabel.baseline - sourceLabel.baseline,
    centerDelta: firstLabel.centerY - sourceLabel.centerY,
    sourceLabel,
    firstLabel,
  };
}

async function attachGeometry(testInfo: TestInfo, geometry: unknown) {
  await testInfo.attach('menu-geometry.json', {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json',
  });
}

async function expectAligned(
  root: Locator,
  row: Locator,
  submenu: Locator,
  testInfo: TestInfo
) {
  // Wait for Radix's collision pass and measured outer-surface offsets, not a timer.
  await attachGeometry(testInfo, await readGeometry(root, row, submenu));
  await expect
    .poll(async () => (await readGeometry(root, row, submenu)).baselineDelta, {
      timeout: 5_000,
    })
    .toBe(0);
  const geometry = await readGeometry(root, row, submenu);
  await attachGeometry(testInfo, geometry);
  expect(Math.abs(geometry.centerDelta)).toBeLessThanOrEqual(1);
  expect(geometry.gap).toBeCloseTo(OVERLAY_SIDE_OFFSET, 0);
  for (const label of [geometry.sourceLabel, geometry.firstLabel]) {
    for (const piece of label.pieces)
      expect(Math.abs(piece.centerDelta)).toBeLessThanOrEqual(1);
  }
  return geometry;
}

async function expectInViewport(page: Page, submenu: Locator) {
  const viewport = page.viewportSize();
  const box = await submenu.boundingBox();
  if (!box || !viewport) throw new Error('Missing viewport geometry');
  expect(box.x).toBeGreaterThanOrEqual(OVERLAY_COLLISION_PADDING - 1);
  expect(box.y).toBeGreaterThanOrEqual(OVERLAY_COLLISION_PADDING - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(
    viewport.width - OVERLAY_COLLISION_PADDING + 1
  );
  expect(box.y + box.height).toBeLessThanOrEqual(
    viewport.height - OVERLAY_COLLISION_PADDING + 1
  );
}

for (const [story, expectedSide] of [
  ['left', 'right'],
  ['right', 'left'],
] as const) {
  test(`unconstrained ${story} account submenu aligns its first row and outer gap`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { root, learn } = await openAccount(page, story);
    await learn.hover();
    const submenu = page.locator(submenuSelector);
    await expect(submenu).toBeVisible();
    await expect(submenu).toHaveAttribute('data-side', expectedSide);
    const geometry = await expectAligned(root, learn, submenu, testInfo);
    const startX =
      expectedSide === 'left'
        ? geometry.row.x + 2
        : geometry.row.x + geometry.row.width - 2;
    const endX =
      expectedSide === 'left'
        ? geometry.first.x + geometry.first.width - 8
        : geometry.first.x + 8;
    await page.mouse.move(startX, geometry.row.y + geometry.row.height / 2);
    await page.mouse.move(endX, geometry.first.y + geometry.first.height / 2, {
      steps: 12,
    });
    await expect(submenu.getByRole('menuitem').first()).toHaveAttribute(
      'data-highlighted',
      ''
    );
    await expect(submenu).toBeVisible();
    // The shared catalog freezes motion. This proves reduced-motion geometry only.
    expect(
      await submenu.evaluate(node => getComputedStyle(node).transform)
    ).toBe('none');
    await page.screenshot({
      path: testInfo.outputPath(`account-${story}.png`),
      animations: 'disabled',
    });
  });
}

test('account keyboard traversal opens, enters, leaves and dismisses the actual submenu', async ({
  page,
}) => {
  const { trigger, root, learn } = await openAccount(page, 'left');
  await root.press('Home');
  const profile = root.getByRole('menuitem', { name: /Open profile for/ });
  await expect(profile).toBeFocused();
  await page.keyboard.press('End');
  await expect(root.getByRole('menuitem', { name: /^Sign Out/ })).toBeFocused();
  await learn.focus();
  await expect(learn).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const submenu = page.locator(submenuSelector);
  const items = submenu.getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(learn).toBeFocused();
  await expect(submenu).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(root).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const width of [320, 390]) {
  test(`account submenu keeps readable actions and keyboard return at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 640 });
    // Both anchor edges, including the real account menu in a DOM
    // RTL document. Its global Radix direction seam remains separate.
    for (const story of ['left', 'account-rtl-document']) {
      const { trigger, root, learn } = await openAccount(page, story);
      await learn.focus();
      await page.keyboard.press('ArrowRight');
      const submenu = page.locator(submenuSelector);
      await expect(submenu.getByRole('menuitem').first()).toBeFocused();
      await expectInViewport(page, submenu);
      await expect
        .poll(async () => {
          const geometry = await readGeometry(root, learn, submenu);
          return (
            geometry.surface.width >=
            Math.min(geometry.row.width, width - 2 * OVERLAY_COLLISION_PADDING)
          );
        })
        .toBe(true);
      const geometry = await readGeometry(root, learn, submenu);
      const labels = submenu
        .getByRole('menuitem')
        .locator(':scope > span.truncate');
      await expect(labels).toHaveCount(5);
      await expect
        .poll(async () =>
          labels.evaluateAll(nodes =>
            nodes.every(node => node.scrollWidth <= node.clientWidth)
          )
        )
        .toBe(true);
      await expect(
        submenu.getByText('Keyboard Shortcuts', { exact: true })
      ).toBeVisible();
      for (const label of [
        'Keyboard Shortcuts',
        'Privacy Policy',
        'Terms Of Service',
        'Cookie Policy',
        'Cookie Settings',
      ]) {
        await expect(
          submenu.getByText(label, { exact: true })
        ).toBeInViewport();
      }
      await attachGeometry(testInfo, { story, ...geometry });
      await page.keyboard.press('End');
      await expect(submenu.getByRole('menuitem').last()).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(learn).toBeFocused();
      await expect(submenu).toBeHidden();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
  });
}

test('vertical collisions shift the submenu within the viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  const { root, learn } = await openAccount(page, 'vertical-collision');
  await learn.hover();
  const submenu = page.locator(submenuSelector);
  await expect(submenu).toBeVisible();
  await expectInViewport(page, submenu);
  await attachGeometry(testInfo, await readGeometry(root, learn, submenu));
  await expect(submenu.getByRole('menuitem').first()).toBeInViewport();
});

test('actual shared RTL submenu opens left and uses RTL keyboard navigation', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/iframe.html?id=${storyPrefix}shared-rtl&viewMode=story`);
  // A CSS locator remains usable after Radix hides the trigger's background.
  const trigger = page
    .locator('[data-account-placement-anchor] button')
    .first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const resources = page.getByRole('menuitem', {
    name: 'Resources',
    exact: true,
  });
  await expect(resources).toBeFocused();
  const root = page.locator(
    `[id="${await trigger.getAttribute('aria-controls')}"]`
  );
  await page.keyboard.press('ArrowLeft');
  const submenu = page.locator(submenuSelector);
  await expect(submenu).toHaveAttribute('data-side', 'left');
  await expect(submenu.getByRole('menuitem').first()).toBeFocused();
  await expectAligned(root, resources, submenu, testInfo);
  await page.keyboard.press('ArrowDown');
  await expect(submenu.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(resources).toBeFocused();
  await expect(submenu).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('account menu remains visible in an RTL document without claiming the app direction seam', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { root, learn } = await openAccount(page, 'account-rtl-document');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await learn.hover();
  const submenu = page.locator(submenuSelector);
  await expect(submenu).toBeVisible();
  await expectInViewport(page, submenu);
  await attachGeometry(testInfo, {
    ...(await readGeometry(root, learn, submenu)),
    radixDirection: await root.getAttribute('dir'),
  });
});
