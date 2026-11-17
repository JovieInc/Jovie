import { expect, test } from './setup';

/**
 * Visual contract of the playlist genre and mood hubs: a hub that no published
 * playlist carries paints the public not-found document with a 404, never an
 * indexable empty page titled after whatever word is in the URL. The hubs
 * query the database; E2E runs against an ephemeral one.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const UNUSED_TAG = 'zz-no-playlist-carries-this';
const HUB_PATHS = [
  `/playlists/genre/${UNUSED_TAG}`,
  `/playlists/mood/${UNUSED_TAG}`,
] as const;

for (const path of HUB_PATHS) {
  test(`${path} paints the not-found document`, async ({ page }) => {
    const response = await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    expect(response?.status(), `${path} has no playlist behind it`).toBe(404);
    await expect
      .poll(
        async () =>
          (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim(),
        { timeout: 20_000 }
      )
      .toMatch(/not found|could not be found|can't find that page/i);
    await expect(page).not.toHaveTitle(/no-playlist-carries-this/i);
  });
}
