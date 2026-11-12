import { expect, type Page, test } from '@playwright/test';

/**
 * Browser proof for `HOMEPAGE_START_CTA`: the full homepage editorial with the
 * flag forced off and on (HomepageSpecSections stories), at desktop and mobile
 * widths. Each state must give one message, and each run keeps a full-page
 * capture in the test output as the before/after evidence.
 */
const STATES = [
  { name: 'current', story: 'start-cta-off', on: false },
  { name: 'flag-on', story: 'start-cta-on', on: true },
] as const;
const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
] as const;

async function settleLayout(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.describe('homepage start CTA flag', () => {
  for (const state of STATES) {
    for (const viewport of VIEWPORTS) {
      test(`${state.name} at ${viewport.label} gives one message`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(
          `/iframe.html?id=marketing-homepagespecsections--${state.story}&viewMode=story`
        );
        const hero = page.getByTestId('marketing-section-hero');
        const close = page.getByTestId('marketing-section-cta');
        await expect(
          hero.getByRole('heading', {
            level: 1,
            name: 'Move your music forward.',
          })
        ).toBeVisible();
        await settleLayout(page);

        const primary = page.getByTestId('homepage-primary-cta');
        if (state.on) {
          await expect(primary).toHaveAttribute('href', '/start');
          await expect(primary).toHaveText('Claim your profile');
          const closeCta = close.getByTestId('homepage-close-cta');
          await expect(closeCta).toHaveAttribute('href', '/start');
          await expect(closeCta).toHaveText('Claim your profile');
          await expect(close.getByTestId('waitlist-role-form')).toHaveCount(0);
          await expect(page.getByText(/invit/i)).toHaveCount(0);
        } else {
          await expect(primary).toHaveAttribute('href', '#request-invite');
          await expect(primary).toHaveText('Request an invite');
          await expect(close.getByTestId('waitlist-role-form')).toBeVisible();
          await expect(
            close.getByRole('heading', { name: 'Jovie opens by invitation.' })
          ).toBeVisible();
          await expect(page.getByTestId('homepage-close-cta')).toHaveCount(0);
        }

        await close.scrollIntoViewIfNeeded();
        await expect(close.getByRole('heading', { level: 2 })).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          )
        ).toBeLessThanOrEqual(1);

        await page.evaluate(() => window.scrollTo(0, 0));
        await settleLayout(page);
        await page.screenshot({
          path: testInfo.outputPath(`${state.name}-${viewport.label}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  }
});
