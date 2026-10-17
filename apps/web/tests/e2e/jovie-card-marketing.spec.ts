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
    }, testInfo) => {
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
      const hero = page.getByTestId('marketing-section-hero');
      await expect(hero.getByRole('img')).toHaveCount(0);
      await expect(
        hero.getByText('Coming soon. Wallet passes are not available yet.', {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Join the list', exact: true })
      ).toHaveAttribute('href', '#join-the-list');
      await expect(page.locator('#join-the-list')).toBeAttached();
      await expect(
        page.getByRole('heading', { name: 'Founder', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Creator', exact: true })
      ).toHaveCount(0);
      for (const section of [
        'hero',
        'how-it-works',
        'feature-grid',
        'faq',
        'cta',
      ]) {
        await expect(
          page.getByTestId(`marketing-section-${section}`)
        ).toHaveCount(1);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath(`card-${viewport.name}-viewport.png`),
        caret: 'initial',
      });
      await page.screenshot({
        path: testInfo.outputPath(`card-${viewport.name}-full.png`),
        fullPage: true,
        caret: 'initial',
      });
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
        page.getByText('The planned card would include a QR code', {
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
