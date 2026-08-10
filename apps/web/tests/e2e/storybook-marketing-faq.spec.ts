import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  collectInteractionCls,
  installInteractionClsObserver,
  measureBufferedCls,
} from '../helpers/cls-measurement';

const FAQ_STORY_ID = 'marketing-sections-faqsection--default';
const VIEWPORTS = [
  { label: 'desktop', width: 1024, height: 1200 },
  { label: 'narrow', width: 390, height: 844 },
] as const;

interface FaqGeometry {
  readonly heading: Awaited<ReturnType<Locator['boundingBox']>>;
  readonly accordion: Awaited<ReturnType<Locator['boundingBox']>>;
  readonly items: readonly Awaited<ReturnType<Locator['boundingBox']>>[];
  readonly panels: readonly Awaited<ReturnType<Locator['boundingBox']>>[];
}

interface MotionState {
  readonly animationDuration: string;
  readonly transitionDuration: string;
  readonly transitionProperty: string;
  readonly transform: string;
  readonly translate: string;
  readonly scale: string;
  readonly boxShadow: string;
}

async function openFaqStory(page: Page) {
  await page.addInitScript(() => {
    // The isolated Storybook document starts shorter than the viewport. Keep
    // the scrollbar gutter stable so opening a semantic disclosure cannot
    // make the outer test canvas recenter or resize unrelated content.
    document.documentElement.style.scrollbarGutter = 'stable';
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/iframe.html?id=${FAQ_STORY_ID}&viewMode=story`, {
    waitUntil: 'networkidle',
  });

  const section = page.locator('[data-pen-contract="pAAhw"]');
  await expect(section).toBeVisible();
  await expect(section).toHaveAttribute(
    'data-layout-contract',
    'bounded-local-disclosure'
  );
  return section;
}

async function readMotionState(locator: Locator): Promise<MotionState> {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      transform: style.transform,
      translate: style.translate,
      scale: style.scale,
      boxShadow: style.boxShadow,
    };
  });
}

async function countActiveAnimations(section: Locator): Promise<number> {
  return section.evaluate(
    element =>
      element
        .getAnimations({ subtree: true })
        .filter(
          animation => animation.playState === 'running' || animation.pending
        ).length
  );
}

function expectZeroDurations(value: string, label: string): void {
  for (const duration of value.split(',')) {
    expect(Number.parseFloat(duration), `${label}: ${value}`).toBe(0);
  }
}

function expectNoTransform(state: MotionState): void {
  expect(state.transform).toBe('none');
  expect(state.translate).toBe('none');
  expect(state.scale).toBe('none');
}

async function readDocumentBox(locator: Locator) {
  return locator.evaluate(element => {
    if (element instanceof HTMLElement && element.hidden) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function readFaqGeometry(section: Locator): Promise<FaqGeometry> {
  const accordion = section.locator('.faq-accordion');
  const items = accordion.locator('.faq-accordion__item');
  const panels = accordion.locator('.faq-accordion__panel');
  const itemCount = await items.count();

  return {
    heading: await readDocumentBox(section.locator('.faq-section__heading')),
    accordion: await readDocumentBox(accordion),
    items: await Promise.all(
      Array.from({ length: itemCount }, (_, index) =>
        readDocumentBox(items.nth(index))
      )
    ),
    panels: await Promise.all(
      Array.from({ length: itemCount }, (_, index) =>
        readDocumentBox(panels.nth(index))
      )
    ),
  };
}

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

function requireBox(
  box: Awaited<ReturnType<Locator['boundingBox']>>,
  label: string
) {
  expect(box, `${label} has geometry`).not.toBeNull();
  if (!box) throw new Error(`${label} has no geometry`);
  return box;
}

test.describe('canonical marketing FAQ disclosure geometry', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} keeps disclosure geometry local and keyboard state correct`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const section = await openFaqStory(page);
      const accordion = section.locator('.faq-accordion');
      const triggers = accordion.getByRole('button');
      const panels = accordion.locator('.faq-accordion__panel');

      await expect(triggers).toHaveCount(3);
      await expect(panels).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expect(triggers.nth(index)).toHaveAttribute(
          'aria-expanded',
          'false'
        );
        await expect(panels.nth(index)).toHaveAttribute('aria-hidden', 'true');
        await expect(panels.nth(index)).toHaveAttribute('hidden', '');
        await expect(triggers.nth(index)).toHaveAttribute(
          'aria-controls',
          await panels.nth(index).getAttribute('id')
        );
        await expect(panels.nth(index)).toHaveAttribute(
          'aria-labelledby',
          await triggers.nth(index).getAttribute('id')
        );
      }

      const collapsedGeometry = await readFaqGeometry(section);
      expect(collapsedGeometry.panels).toEqual([null, null, null]);
      expect(await measureBufferedCls(page, 50)).toBe(0);
      await installInteractionClsObserver(page);
      await settleLayout(page);
      expect(await collectInteractionCls(page, 50)).toBe(0);
      expect(await readFaqGeometry(section)).toEqual(collapsedGeometry);

      await triggers.first().focus();
      await page.keyboard.press('End');
      await expect(triggers.nth(2)).toBeFocused();
      await page.keyboard.press('Home');
      await expect(triggers.first()).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(triggers.nth(2)).toBeFocused();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await expect(triggers.nth(1)).toBeFocused();
      const focusedReducedMotion = await readMotionState(triggers.nth(1));
      expectZeroDurations(
        focusedReducedMotion.animationDuration,
        'focused trigger animation duration'
      );
      expectZeroDurations(
        focusedReducedMotion.transitionDuration,
        'focused trigger transition duration'
      );
      expectNoTransform(focusedReducedMotion);
      expect(await countActiveAnimations(section)).toBe(0);
      await installInteractionClsObserver(page);
      await page.keyboard.press('Enter');
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(panels.nth(1)).toHaveAttribute('aria-hidden', 'false');
      await expect(panels.nth(1)).not.toHaveAttribute('hidden', '');
      await expect(panels.nth(1)).toHaveCSS('transition-duration', '0s');
      const openedReducedMotion = await readMotionState(triggers.nth(1));
      expectZeroDurations(
        openedReducedMotion.animationDuration,
        'opened trigger animation duration'
      );
      expectZeroDurations(
        openedReducedMotion.transitionDuration,
        'opened trigger transition duration'
      );
      expectNoTransform(openedReducedMotion);
      expect(await countActiveAnimations(section)).toBe(0);
      await page.waitForTimeout(20);
      expect(await countActiveAnimations(section)).toBe(0);
      const expandedGeometry = await readFaqGeometry(section);
      await settleLayout(page);
      // CLS excludes every shift shortly after qualifying input, including an
      // accidental one. This zero only rules out non-recent-input shifts; the
      // source contract and bounding boxes below prove local state ownership.
      expect(await collectInteractionCls(page, 50)).toBe(0);
      const collapsedAccordion = requireBox(
        collapsedGeometry.accordion,
        'collapsed accordion'
      );
      const expandedAccordion = requireBox(
        expandedGeometry.accordion,
        'expanded accordion'
      );
      const openedPanel = requireBox(
        expandedGeometry.panels[1],
        'opened panel'
      );
      const collapsedFollowingItem = requireBox(
        collapsedGeometry.items[2],
        'collapsed following item'
      );
      const expandedFollowingItem = requireBox(
        expandedGeometry.items[2],
        'expanded following item'
      );

      expect(expandedGeometry.heading).toEqual(collapsedGeometry.heading);
      expect(expandedFollowingItem.y - collapsedFollowingItem.y).toBeCloseTo(
        openedPanel.height,
        1
      );
      expect(expandedAccordion.height - collapsedAccordion.height).toBeCloseTo(
        openedPanel.height,
        1
      );

      await triggers.nth(2).click();
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'false');
      await expect(panels.nth(1)).toHaveAttribute('aria-hidden', 'true');
      await expect(triggers.nth(2)).toHaveAttribute('aria-expanded', 'true');
      await expect(panels.nth(2)).toHaveAttribute('aria-hidden', 'false');
      await expect(panels.nth(1)).toHaveAttribute('hidden', '');
      await expect(panels.nth(2)).not.toHaveAttribute('hidden', '');
      expect((await readFaqGeometry(section)).heading).toEqual(
        collapsedGeometry.heading
      );

      await page.keyboard.press('Space');
      await expect(triggers.nth(2)).toHaveAttribute('aria-expanded', 'false');
      await expect(panels.nth(2)).toHaveAttribute('aria-hidden', 'true');
      await expect(panels.nth(2)).toHaveAttribute('hidden', '');
      const closedReducedMotion = await readMotionState(triggers.nth(2));
      expectZeroDurations(
        closedReducedMotion.animationDuration,
        'closed trigger animation duration'
      );
      expectZeroDurations(
        closedReducedMotion.transitionDuration,
        'closed trigger transition duration'
      );
      expectNoTransform(closedReducedMotion);
      expect(await countActiveAnimations(section)).toBe(0);
      await page.waitForTimeout(20);
      expect(await countActiveAnimations(section)).toBe(0);
      expect(await readFaqGeometry(section)).toEqual(collapsedGeometry);

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(0);
    });
  }
});
