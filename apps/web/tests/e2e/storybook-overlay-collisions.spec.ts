import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Overlay collision stress suite.
 *
 * JOV-INV-039: runtime proof for the overlay layer contract's semantic
 * stacking order and collision guarantees.
 *
 * Drives `Guardrails/Overlay Collisions` stories built from the canonical
 * @jovie/ui primitives and asserts the overlay layer contract:
 *   - the newest overlay is the topmost hit target (no overlay renders
 *     behind the surface that opened it)
 *   - Escape closes only the topmost overlay
 *   - focus is trapped inside modals and restored when they close
 *   - scroll lock does not shift the page behind the modal
 *   - nested submenus stay inside the viewport and keep their parents open
 *   - a popover closes when its anchor unmounts
 *   - rapid open/close leaves no orphaned layer or pointer lock
 */

const STORY_PREFIX = 'guardrails-overlay-collisions';
const RENDER_TIMEOUT_MS = 60_000;

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'mobile', width: 390, height: 844 },
] as const;

async function openStory(
  page: Page,
  story: string,
  viewport: (typeof VIEWPORTS)[number] = VIEWPORTS[0]
) {
  await page.setViewportSize(viewport);
  await page.goto(`/iframe.html?id=${STORY_PREFIX}--${story}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('#storybook-root')).not.toBeEmpty({
    timeout: RENDER_TIMEOUT_MS,
  });
}

/**
 * True when a visual hit test at the element's center lands inside it.
 * Radix modal layers set `pointer-events: none` on the layers beneath them,
 * which would let a plain elementFromPoint see through a sheet that paints
 * over a dialog. The probe forces pointer events on so it measures paint
 * order, not event routing.
 */
async function expectTopmost(locator: Locator) {
  await expect(locator).toBeVisible();
  const hit = await locator.evaluate(element => {
    const probe = document.createElement('style');
    probe.textContent = '* { pointer-events: auto !important; }';
    document.head.append(probe);
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + Math.min(rect.height / 2, 16)
    );
    probe.remove();
    return {
      inside: target !== null && element.contains(target),
      hitTestId:
        target?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
    };
  });
  expect(
    hit.inside,
    `expected ${await locator.getAttribute('data-testid')} to be topmost, hit ${hit.hitTestId}`
  ).toBe(true);
}

async function expectInsideViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;
  const label = await locator.getAttribute('data-testid');
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(
    viewport.width + 0.5
  );
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(
    viewport.height + 0.5
  );
}

async function expectNoPointerLock(page: Page) {
  const state = await page.evaluate(() => ({
    pointerEvents: document.body.style.pointerEvents,
    lockedAttr: document.body.hasAttribute('data-scroll-locked'),
    orphanLayers: document.querySelectorAll(
      '[data-radix-popper-content-wrapper]'
    ).length,
  }));
  expect(state.pointerEvents).not.toBe('none');
  expect(state.lockedAttr).toBe(false);
  expect(state.orphanLayers).toBe(0);
}

async function expectFocusInside(page: Page, container: Locator) {
  const inside = await container.evaluate(element =>
    element.contains(document.activeElement)
  );
  expect(inside, 'focus escaped the modal').toBe(true);
}

async function expectNoSeriousA11yViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Contrast is owned by the token contrast gates, not the overlay contract.
    .disableRules(['color-contrast'])
    .analyze();
  const serious = results.violations.filter(
    violation =>
      violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(
    serious.map(violation => `${violation.id}: ${violation.help}`)
  ).toEqual([]);
}

test.describe('overlay collisions: sheet stack', () => {
  for (const viewport of VIEWPORTS) {
    test(`select and popover inside a sheet render above it (${viewport.id})`, async ({
      page,
    }) => {
      await openStory(page, 'sheet-stack', viewport);
      await page.getByTestId('sheet-trigger').click();
      await expect(page.getByTestId('sheet-content')).toBeVisible();

      await page.getByTestId('sheet-select-trigger').click();
      await expectTopmost(page.getByTestId('sheet-select-content'));
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('sheet-select-content')).toBeHidden();
      await expect(page.getByTestId('sheet-content')).toBeVisible();

      await page.getByTestId('sheet-popover-trigger').click();
      await expectTopmost(page.getByTestId('sheet-popover-content'));
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('sheet-popover-content')).toBeHidden();
      await expect(page.getByTestId('sheet-content')).toBeVisible();
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`alert dialog over a sheet is topmost and Escape unwinds one layer at a time (${viewport.id})`, async ({
      page,
    }) => {
      await openStory(page, 'sheet-stack', viewport);
      await page.getByTestId('sheet-trigger').click();
      await page.getByTestId('sheet-alert-trigger').click();

      const alert = page.getByTestId('sheet-alert-content');
      await expectTopmost(alert);
      await expectFocusInside(page, alert);
      await expectNoSeriousA11yViolations(page, '[role="alertdialog"]');

      await page.keyboard.press('Escape');
      await expect(alert).toBeHidden();
      await expect(page.getByTestId('sheet-content')).toBeVisible();
      await expect(page.getByTestId('sheet-alert-trigger')).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('sheet-content')).toBeHidden();
      await expect(page.getByTestId('sheet-trigger')).toBeFocused();
      await expectNoPointerLock(page);
    });
  }
});

test.describe('overlay collisions: dialog opened from a dropdown', () => {
  test('keyboard only: open, trap focus, close, restore focus', async ({
    page,
  }) => {
    await openStory(page, 'dialog-from-dropdown');
    const trigger = page.getByTestId('menu-trigger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-content')).toBeVisible();
    await expect(page.getByTestId('menu-item-rename')).toBeFocused();
    await page.keyboard.press('Enter');

    const dialog = page.getByTestId('dialog-content');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('menu-content')).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expectTopmost(dialog);
    await expectFocusInside(page, dialog);

    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      await expectFocusInside(page, dialog);
    }
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Shift+Tab');
      await expectFocusInside(page, dialog);
    }
    await expectNoSeriousA11yViolations(page, '[role="dialog"]');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expectNoPointerLock(page);
  });

  test('popover and select inside the dialog are topmost; Escape closes only them', async ({
    page,
  }) => {
    await openStory(page, 'dialog-from-dropdown');
    await page.getByTestId('menu-trigger').click();
    await page.getByTestId('menu-item-rename').click();
    const dialog = page.getByTestId('dialog-content');
    await expect(dialog).toBeVisible();

    await page.getByTestId('dialog-popover-trigger').click();
    await expectTopmost(page.getByTestId('dialog-popover-content'));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dialog-popover-content')).toBeHidden();
    await expect(dialog).toBeVisible();

    await page.getByTestId('dialog-select-trigger').click();
    await expectTopmost(page.getByTestId('dialog-select-content'));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dialog-select-content')).toBeHidden();
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expectNoPointerLock(page);
  });

  test('rapid open/close leaves one menu at most and no pointer lock', async ({
    page,
  }) => {
    await openStory(page, 'dialog-from-dropdown');
    const trigger = page.getByTestId('menu-trigger');
    for (let index = 0; index < 5; index += 1) {
      await trigger.click();
      await page.keyboard.press('Escape');
    }
    await expect(page.getByTestId('menu-content')).toHaveCount(0);
    await expectNoPointerLock(page);

    for (let index = 0; index < 4; index += 1) {
      await trigger.click();
      await page.getByTestId('menu-item-rename').click();
      await expect(page.getByTestId('dialog-content')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('dialog-content')).toBeHidden();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectNoPointerLock(page);
    await trigger.click();
    await expect(page.getByTestId('menu-content')).toBeVisible();
  });
});

test.describe('overlay collisions: nested submenus at viewport edges', () => {
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  for (const viewport of VIEWPORTS) {
    for (const corner of corners) {
      test(`three levels stay in viewport at ${corner} (${viewport.id})`, async ({
        page,
      }) => {
        await openStory(page, 'nested-menus-at-edges', viewport);
        const trigger = page.getByTestId(`nested-trigger-${corner}`);
        await trigger.focus();
        await page.keyboard.press('Enter');
        const level1 = page.getByTestId(`nested-l1-${corner}`);
        await expect(level1).toBeVisible();

        await page.getByTestId(`nested-l1-sub-${corner}`).focus();
        await page.keyboard.press('ArrowRight');
        const level2 = page.getByTestId(`nested-l2-${corner}`);
        await expect(level2).toBeVisible();

        await page.getByTestId(`nested-l2-sub-${corner}`).focus();
        await page.keyboard.press('ArrowRight');
        const level3 = page.getByTestId(`nested-l3-${corner}`);
        await expect(level3).toBeVisible();

        for (const level of [level1, level2, level3]) {
          await expectInsideViewport(page, level);
        }
        await expectTopmost(level3);

        await page.keyboard.press('ArrowLeft');
        await expect(level3).toBeHidden();
        await expect(level2).toBeVisible();
        await expect(level1).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(level1).toBeHidden();
        await expect(trigger).toBeFocused();
        await expectNoPointerLock(page);
      });
    }
  }

  test('hovering into a submenu keeps every parent open', async ({ page }) => {
    await openStory(page, 'nested-menus-at-edges');
    await page.getByTestId('nested-trigger-top-left').click();
    await page.getByTestId('nested-l1-sub-top-left').hover();
    await expect(page.getByTestId('nested-l2-top-left')).toBeVisible();
    await page.getByTestId('nested-l2-sub-top-left').hover();
    await expect(page.getByTestId('nested-l3-top-left')).toBeVisible();
    await page.getByTestId('nested-l3-item-top-left').hover();
    await expect(page.getByTestId('nested-l1-top-left')).toBeVisible();
    await expect(page.getByTestId('nested-l2-top-left')).toBeVisible();
    await expect(page.getByTestId('nested-l3-top-left')).toBeVisible();
  });
});

test.describe('overlay collisions: anchors and scroll lock', () => {
  test('a popover closes when its anchor unmounts', async ({ page }) => {
    await openStory(page, 'popover-anchor-unmount');
    await page.getByTestId('anchor-trigger').click();
    const content = page.getByTestId('anchor-popover-content');
    await expect(content).toBeVisible();
    await page.getByTestId('anchor-remove').click();
    await expect(page.getByTestId('anchor-state')).toHaveText('removed');
    await expect(content).toBeHidden();
  });

  for (const viewport of VIEWPORTS) {
    test(`modal scroll lock does not shift the page (${viewport.id})`, async ({
      page,
    }) => {
      await openStory(page, 'scroll-lock', viewport);
      await page.evaluate(() => window.scrollTo(0, 240));
      const marker = page.getByTestId('scroll-lock-marker');
      const before = await marker.boundingBox();
      const scrollBefore = await page.evaluate(() => window.scrollY);

      await page.getByTestId('scroll-lock-trigger').click();
      await expect(page.getByTestId('scroll-lock-dialog')).toBeVisible();
      const during = await marker.boundingBox();
      expect(Math.abs((during?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(1);
      expect(Math.abs((during?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1);

      await page.mouse.wheel(0, 600);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('scroll-lock-dialog')).toBeHidden();
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      const after = await marker.boundingBox();
      expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(1);
      await expectNoPointerLock(page);
    });
  }
});
