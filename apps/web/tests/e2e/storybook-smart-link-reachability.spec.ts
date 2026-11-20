import { expect, test } from '@playwright/test';
import { runDspInteraction } from './utils/public-surface-helpers';

const STORY_ID = 'public-routes-releasesmartlink--web-196-legacy-fallback';
const VIEWPORTS = [
  { name: 'short desktop', width: 1280, height: 720 },
  { name: 'short mobile', width: 390, height: 520 },
  { name: 'tall desktop', width: 1280, height: 1000 },
] as const;

test.use({ actionTimeout: 5_000 });

for (const viewport of VIEWPORTS) {
  test(`smart-link services and footer remain reachable on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    // Component fixtures never follow music handoffs or send analytics.
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.origin ===
          new URL(testInfo.project.use.baseURL ?? 'http://localhost:6006')
            .origin &&
        !url.pathname.startsWith('/api/')
      ) {
        return route.continue();
      }
      if (request.resourceType() === 'image') {
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#202124"/></svg>',
        });
      }
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('action-dial')).toBeVisible();

    // Reuse the public-route admission checks, including normal pointer clicks
    // on each service, canonical provider URLs and the non-Spotify requirement.
    expect(await runDspInteraction(page)).toBe(true);

    const listbox = page.getByTestId('action-dial-listbox');
    await listbox.focus();
    await listbox.press('Home');
    await expect(listbox.getByRole('option').first()).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(listbox).toBeFocused();

    const byline = page.getByTestId('smart-link-artist-byline');
    await byline.scrollIntoViewIfNeeded();
    await byline.click({ trial: true });
    const privacy = page
      .locator('footer')
      .getByRole('link', { name: 'Privacy', exact: true });
    await privacy.scrollIntoViewIfNeeded();
    await privacy.click({ trial: true });
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  });
}
