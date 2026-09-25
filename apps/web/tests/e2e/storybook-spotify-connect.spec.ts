import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test.describe.configure({ retries: 0, timeout: 240_000 });

test('Spotify connection story presents a keyboard accessible dialog', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/iframe.html?id=dashboard-releases-shell-releases-view--spotify-connection&viewMode=story',
    { waitUntil: 'commit' }
  );

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 180_000 });
  await expect(
    dialog.getByRole('heading', { name: 'Connect Spotify' })
  ).toBeVisible();
  const search = dialog.getByRole('combobox', {
    name: 'Search Spotify artists or paste a link',
  });
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    expect(bounds.x).toBeGreaterThanOrEqual(-1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  }

  const screenshot = await page.screenshot({ animations: 'disabled' });
  const evidenceDir = join('test-results', 'storybook-selected-evidence');
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(join(evidenceDir, 'spotify-connect-mobile.png'), screenshot);
  await testInfo.attach('spotify-connect-mobile.png', {
    body: screenshot,
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
