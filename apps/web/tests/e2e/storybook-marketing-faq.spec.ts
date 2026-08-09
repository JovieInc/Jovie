import { expect, type Locator, type Page, test } from '@playwright/test';

const FAQ_STORY_ID = 'marketing-sections--faq';
const VIEWPORTS = [
  { label: 'desktop', width: 1024, height: 1200 },
  { label: 'narrow', width: 390, height: 844 },
] as const;

interface StableGeometry {
  readonly accordion: Awaited<ReturnType<Locator['boundingBox']>>;
  readonly triggers: readonly Awaited<ReturnType<Locator['boundingBox']>>[];
  readonly answers: readonly Awaited<ReturnType<Locator['boundingBox']>>[];
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
    'height-stable-disclosure'
  );
  return section;
}

async function readStableGeometry(section: Locator): Promise<StableGeometry> {
  const accordion = section.locator('.faq-accordion');
  const triggers = accordion.getByRole('button');
  const answers = accordion.locator('.faq-accordion__answer');
  const triggerCount = await triggers.count();

  return {
    accordion: await accordion.boundingBox(),
    triggers: await Promise.all(
      Array.from({ length: triggerCount }, (_, index) =>
        triggers.nth(index).boundingBox()
      )
    ),
    answers: await Promise.all(
      Array.from({ length: triggerCount }, (_, index) =>
        answers.nth(index).boundingBox()
      )
    ),
  };
}

async function expectStableGeometry(
  actual: StableGeometry,
  expected: StableGeometry
) {
  expect(actual.accordion).toEqual(expected.accordion);
  expect(actual.triggers).toEqual(expected.triggers);
  expect(actual.answers).toEqual(expected.answers);
}

test.describe('canonical marketing FAQ disclosure geometry', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} keeps disclosure geometry and keyboard state stable`, async ({
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
      }

      const collapsedGeometry = await readStableGeometry(section);

      await triggers.first().focus();
      await page.keyboard.press('ArrowDown');
      await expect(triggers.nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
      await expect(panels.nth(1)).toHaveAttribute('aria-hidden', 'false');
      await expect(panels.nth(1)).toHaveCSS('transition-duration', '0s');
      await expectStableGeometry(
        await readStableGeometry(section),
        collapsedGeometry
      );

      await triggers.nth(2).click();
      await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'false');
      await expect(panels.nth(1)).toHaveAttribute('aria-hidden', 'true');
      await expect(triggers.nth(2)).toHaveAttribute('aria-expanded', 'true');
      await expect(panels.nth(2)).toHaveAttribute('aria-hidden', 'false');
      await expectStableGeometry(
        await readStableGeometry(section),
        collapsedGeometry
      );

      await page.keyboard.press('Space');
      await expect(triggers.nth(2)).toHaveAttribute('aria-expanded', 'false');
      await expect(panels.nth(2)).toHaveAttribute('aria-hidden', 'true');
      await expectStableGeometry(
        await readStableGeometry(section),
        collapsedGeometry
      );

      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(0);
    });
  }
});
