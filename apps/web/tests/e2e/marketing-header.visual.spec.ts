import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

test('marketing routes share the approved header and full footer @smoke', async ({
  page,
}) => {
  const claim = getClaimProfileIntent();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/',
      '/pricing',
      '/solutions/artists',
      '/artist-profiles',
      '/product',
      '/support',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const header = page.getByTestId('header-nav');
      await expect(header).toHaveCount(1);
      await expect(header).toHaveAttribute(
        'data-presentation',
        'marketing-glass'
      );
      const mark = header.getByTestId('site-logo-link').locator('svg').first();
      await expect(mark).toHaveAttribute('width', '28');
      await expect(mark).toHaveAttribute('height', '28');

      const navigation =
        width === 390
          ? page.getByRole('navigation', { name: 'Mobile Navigation' })
          : header;
      if (width === 390) {
        await header.getByRole('button', { name: 'Open menu' }).press('Enter');
        await expect(navigation.getByRole('link').first()).toBeFocused();
        const sheet = await navigation.boundingBox();
        expect(sheet).not.toBeNull();
        expect(sheet?.width).toBe(width);
        expect(sheet?.y).toBeGreaterThanOrEqual(0);
      }
      const customers = navigation.getByRole('link', { name: 'Customers' });
      await expect(customers).toHaveAttribute('href', '/solutions/artists');
      const pricing = navigation.getByRole('link', {
        name: 'Pricing',
        exact: true,
      });
      await expect(pricing).toBeVisible();
      if (path === '/pricing')
        await expect(pricing).toHaveAttribute('aria-current', 'page');
      if (path === '/solutions/artists')
        await expect(customers).toHaveAttribute('aria-current', 'page');
      await expect(
        navigation.getByRole('link', { name: claim.label })
      ).toHaveAttribute('href', claim.href);
      if (width === 390) {
        await page.keyboard.press('Escape');
        await expect(
          header.getByRole('button', { name: 'Open menu' })
        ).toBeFocused();
      }
      await expect(
        page
          .getByTestId('marketing-footer')
          .getByRole('navigation', { name: 'Footer', exact: true })
      ).toBeVisible();
    }
  }
});
