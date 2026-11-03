import { expect, test } from '@playwright/test';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: 'reduce',
});

for (const route of ['/demo/video', '/demovideo']) {
  for (const width of [1440, 390]) {
    test(`${route} recovers to useful product content at ${width}px`, async ({
      page,
    }, testInfo) => {
      expect(FEATURE_FLAGS.SHOW_PRODUCT_DEMO_VIDEO).toBe(false);
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      expect(response?.ok()).toBe(true);
      await expect(page).toHaveURL(/\/product$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('main')).not.toBeEmpty();
      await expect(page.getByTestId('demo-video-page')).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Download demo' })
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
      const capture = testInfo.outputPath('product-recovery.png');
      await page.screenshot({ path: capture, fullPage: true });
      await testInfo.attach('product-recovery', {
        path: capture,
        contentType: 'image/png',
      });
    });
  }
}
