import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './setup';

interface DocumentBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface FaqLayout {
  readonly root: DocumentBox;
  readonly heading: DocumentBox;
  readonly accordion: DocumentBox;
  readonly firstRow: DocumentBox;
  readonly firstTrigger: DocumentBox;
  readonly followingRow: DocumentBox;
}

interface MotionState {
  readonly transitionDuration: string;
  readonly transitionProperty: string;
  readonly transform: string;
  readonly translate: string;
  readonly scale: string;
  readonly boxShadow: string;
}

const ROUTES = [
  { label: 'about', path: '/about' },
  { label: 'support', path: '/support' },
] as const;

const VIEWPORTS = [
  { label: '1024', width: 1024, height: 1200 },
  { label: '390', width: 390, height: 844 },
] as const;

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function requireBox(
  locator: Locator,
  label: string
): Promise<DocumentBox> {
  const box = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  });

  expect(box.width, `${label} has width`).toBeGreaterThan(0);
  expect(box.height, `${label} has height`).toBeGreaterThan(0);
  return box;
}

async function readFaqLayout(section: Locator): Promise<FaqLayout> {
  const accordion = section.locator('.faq-accordion');
  const rows = accordion.locator('.faq-accordion__item');

  return {
    root: await requireBox(section, 'FAQ root'),
    heading: await requireBox(
      section.locator('.faq-section__heading'),
      'FAQ heading'
    ),
    accordion: await requireBox(accordion, 'FAQ accordion'),
    firstRow: await requireBox(rows.first(), 'first FAQ row'),
    firstTrigger: await requireBox(
      rows.first().locator('.faq-accordion__trigger'),
      'first FAQ trigger'
    ),
    followingRow: await requireBox(rows.nth(1), 'following FAQ row'),
  };
}

function expectAnchorWidthsInvariant(
  actual: FaqLayout,
  expected: FaqLayout,
  phase: string
): void {
  for (const key of [
    'root',
    'heading',
    'accordion',
    'firstRow',
    'firstTrigger',
  ] as const) {
    expect(
      Math.abs(actual[key].x - expected[key].x),
      `${phase} ${key} x is invariant`
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(actual[key].width - expected[key].width),
      `${phase} ${key} width is invariant`
    ).toBeLessThanOrEqual(0.5);
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  expect(widths.scroll).toBe(widths.client);
}

async function readMotionState(locator: Locator): Promise<MotionState> {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      transform: style.transform,
      translate: style.translate,
      scale: style.scale,
      boxShadow: style.boxShadow,
    };
  });
}

function expectNoTransform(state: MotionState): void {
  expect(state.transform).toBe('none');
  expect(state.translate).toBe('none');
  expect(state.scale).toBe('none');
}

test.describe('public FAQ width invariance', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route.label} ${viewport.label} keeps FAQ anchors fixed across disclosure`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(route.path, { waitUntil: 'networkidle' });
        await settleLayout(page);

        const section = page.locator('[data-pen-contract="pAAhw"]');
        const accordion = section.locator('.faq-accordion');
        const rows = accordion.locator('.faq-accordion__item');
        const firstTrigger = rows.first().locator('.faq-accordion__trigger');
        const firstPanel = rows.first().locator('.faq-accordion__panel');

        await expect(section).toBeVisible();
        await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
        await expect(firstPanel).toHaveAttribute('aria-hidden', 'true');
        await expect(firstPanel).toHaveAttribute('hidden', '');

        const collapsed = await readFaqLayout(section);
        await settleLayout(page);
        const unprompted = await readFaqLayout(section);

        expectAnchorWidthsInvariant(unprompted, collapsed, 'unprompted');
        expect(
          Math.abs(unprompted.followingRow.y - collapsed.followingRow.y),
          'following flow does not move before user input'
        ).toBeLessThanOrEqual(0.5);
        expect(collapsed.firstTrigger.height).toBeGreaterThanOrEqual(44);
        await expectNoHorizontalOverflow(page);

        await firstTrigger.click();
        await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');
        await expect(firstPanel).toHaveAttribute('aria-hidden', 'false');
        await expect(firstPanel).not.toHaveAttribute('hidden', '');
        await settleLayout(page);

        const expanded = await readFaqLayout(section);
        const openedPanel = await requireBox(firstPanel, 'opened FAQ panel');

        expectAnchorWidthsInvariant(expanded, collapsed, 'expanded');
        expect(
          Math.abs(
            expanded.followingRow.y -
              collapsed.followingRow.y -
              openedPanel.height
          ),
          'following flow moves by exactly the opened panel height'
        ).toBeLessThanOrEqual(0.5);
        await expectNoHorizontalOverflow(page);

        await firstTrigger.click();
        await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
        await expect(firstPanel).toHaveAttribute('aria-hidden', 'true');
        await expect(firstPanel).toHaveAttribute('hidden', '');
        await settleLayout(page);

        const recollapsed = await readFaqLayout(section);
        expectAnchorWidthsInvariant(recollapsed, collapsed, 'recollapsed');
        expect(
          Math.abs(recollapsed.followingRow.y - collapsed.followingRow.y),
          'following flow returns to its original position'
        ).toBeLessThanOrEqual(0.5);
        await expectNoHorizontalOverflow(page);
      });
    }
  }

  for (const viewport of VIEWPORTS) {
    test(`about ${viewport.label} preserves normal-motion keyboard focus without transforms`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/about', { waitUntil: 'networkidle' });

      const section = page.locator('[data-pen-contract="pAAhw"]');
      const triggers = section.locator('.faq-accordion__trigger');
      await expect(section).toBeVisible();
      await triggers.first().scrollIntoViewIfNeeded();
      await triggers.first().focus();
      await page.keyboard.press('ArrowDown');
      await expect(triggers.nth(1)).toBeFocused();
      await page.waitForTimeout(200);

      const focusedMotion = await readMotionState(triggers.nth(1));
      expect(focusedMotion.transitionProperty).toContain('box-shadow');
      expect(focusedMotion.transitionProperty).toContain('border-color');
      expect(focusedMotion.transitionDuration).toContain('0.15s');
      expect(focusedMotion.boxShadow).not.toBe('none');
      expectNoTransform(focusedMotion);

      await page.keyboard.press('Enter');
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
      expectNoTransform(await readMotionState(triggers.nth(1)));
      await expectNoHorizontalOverflow(page);
    });
  }
});
