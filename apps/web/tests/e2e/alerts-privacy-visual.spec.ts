import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

// Release alerts is a phone/email signup form. No third-party pixel may load
// where people type (CIPA wiretap exposure). Renders the real route at both
// viewports and checks the form is visible, nothing overflows, and no Meta
// request or global was created.
const TEST_PROFILE = 'dualipa';
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`alerts page renders with no Meta pixel (${viewport.name})`, async ({
    page,
  }) => {
    const metaRequests: string[] = [];
    page.on('request', request => {
      if (/facebook\.(?:com|net)|connect\.facebook/i.test(request.url())) {
        metaRequests.push(request.url());
      }
    });
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(`/${TEST_PROFILE}/alerts`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForHydration(page);

    await expect(page.locator('h1, form').first()).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => 'fbq' in window)).toBe(false);
    expect(metaRequests).toEqual([]);
  });
}
