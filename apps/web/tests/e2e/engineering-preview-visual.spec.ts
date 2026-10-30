import { expect, test } from './setup';

/**
 * Visual contract of the founder preview gallery routes (JOV-5475): outside a
 * real local development server the surface must paint the public not-found
 * document — never draft engineering stories. Guards the page-level gate in
 * app/(marketing)/engineering/preview/layout.tsx; the proxy block already
 * covers hosted deployments, and this evidence covers the CI preview servers
 * where VERCEL_ENV=development previously published the gallery.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PREVIEW_PATHS = [
  '/engineering/preview',
  '/engineering/preview/verified-changelog',
] as const;

for (const path of PREVIEW_PATHS) {
  test(`${path} paints the not-found document outside local development`, async ({
    page,
  }) => {
    const response = await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    expect(response?.status(), `${path} must remain unpublished`).toBe(404);
    const body = (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .trim();
    expect(body, `${path} did not render its not-found state`).toMatch(
      /not found|could not be found|can't find that page/i
    );
    await expect(page.locator('main').first()).toBeVisible();
  });
}
