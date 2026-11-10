import { expect, test } from '@playwright/test';
import { prepareImagesForScreenshot } from '../product-screenshots/helpers';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`download copy and layout at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      '/iframe.html?id=marketing-pages-download--default&viewMode=story'
    );

    const surface = page.locator('[data-page="download"]');
    const hero = surface.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', {
        level: 1,
        name: 'Jovie, Installed Where You Work.',
      })
    ).toBeVisible();
    await expect(hero.getByText(/Download the Mac app\./)).toBeVisible();
    await expect(surface).not.toContainText(/\bnative\b/i);
    await page.evaluate(() => document.fonts.ready);
    await prepareImagesForScreenshot(page);

    const downloads = surface.getByRole('link', {
      name: 'Download for Mac',
      exact: true,
    });
    await expect(downloads).toHaveCount(3);
    for (const download of await downloads.all()) {
      await expect(download).toHaveAttribute('href', '/api/desktop/download');
    }

    const platformHeading = surface.getByRole('heading', {
      level: 2,
      name: /^Mac Workspace$/,
    });
    await platformHeading.scrollIntoViewIfNeeded();
    await expect(platformHeading).toBeVisible();
    expect(
      await platformHeading.evaluate(
        element => element.scrollWidth <= element.clientWidth
      ),
      'Mac heading must fit its column'
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      'Page must fit the viewport'
    ).toBe(true);

    const screenshot = testInfo.outputPath(`download-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('download-page.png', {
      path: screenshot,
      contentType: 'image/png',
    });
  });
}
