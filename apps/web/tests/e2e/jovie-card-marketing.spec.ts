import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './setup';
import { installPublicRouteMocks } from './utils/public-surface-helpers';

test.describe('Jovie Card marketing page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const) {
    test(`${viewport.name} stays responsive and keyboard-operable`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await installPublicRouteMocks(page);
      await page.goto('/card', { waitUntil: 'domcontentloaded' });

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Your Jovie profile. Ready for the real world.',
        })
      ).toBeVisible();
      await page.waitForFunction(() => {
        const trigger = document.querySelector(
          '.faq-accordion__trigger'
        ) as HTMLElement | null;
        return (
          trigger !== null &&
          Object.keys(trigger).some(key => key.startsWith('__reactProps$'))
        );
      });

      const overflows = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('main *'))
          .filter(element => element.scrollWidth > element.clientWidth + 1)
          .map(element => element.tagName)
          .slice(0, 5)
      );
      expect(overflows).toEqual([]);

      const firstQuestion = page.getByRole('button', {
        name: 'How will sharing work?',
      });
      await firstQuestion.scrollIntoViewIfNeeded();
      await firstQuestion.focus();
      await expect(firstQuestion).toBeFocused();
      await firstQuestion.press('ArrowDown');
      await expect(
        page.getByRole('button', {
          name: 'Does the person I meet need Jovie?',
        })
      ).toBeFocused();
      await firstQuestion.click();
      await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
      await expect(
        page.getByText('The planned card will include a QR code', {
          exact: false,
        })
      ).toBeVisible();

      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
    });
  }
});
