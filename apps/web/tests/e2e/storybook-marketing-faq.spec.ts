import { expect, type Locator, type Page, test } from '@playwright/test';

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

async function openFaqStory(page: Page) {
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

async function readFaqGeometry(section: Locator): Promise<FaqGeometry> {
  const accordion = section.locator('.faq-accordion');
  const items = accordion.locator('.faq-accordion__item');
  const panels = accordion.locator('.faq-accordion__panel');
  const itemCount = await items.count();

  return {
    heading: await section.locator('.faq-section__heading').boundingBox(),
    accordion: await accordion.boundingBox(),
    items: await Promise.all(
      Array.from({ length: itemCount }, (_, index) =>
        items.nth(index).boundingBox()
      )
    ),
    panels: await Promise.all(
      Array.from({ length: itemCount }, (_, index) =>
        panels.nth(index).boundingBox()
      )
    ),
  };
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
        await expect(panels.nth(index)).toHaveAttribute(
          'aria-labelledby',
          await triggers.nth(index).getAttribute('id')
        );
      }

      const collapsedGeometry = await readFaqGeometry(section);
      expect(collapsedGeometry.panels).toEqual([null, null, null]);
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
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
      await page.keyboard.press('Enter');
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(panels.nth(1)).toHaveAttribute('aria-hidden', 'false');
      await expect(panels.nth(1)).not.toHaveAttribute('hidden', '');
      await expect(panels.nth(1)).toHaveCSS('transition-duration', '0s');
      const expandedGeometry = await readFaqGeometry(section);
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
      expect(await readFaqGeometry(section)).toEqual(collapsedGeometry);

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(0);
    });
  }
});
