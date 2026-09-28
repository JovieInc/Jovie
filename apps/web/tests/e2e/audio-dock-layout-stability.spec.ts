/**
 * E2E layout-stability spec: the shell audio dock (JOV-6680) must reveal the
 * player by animating ONLY the main panel's height — no horizontal shift and
 * no re-flow of any main content element.
 *
 * How it works:
 * 1. Auth via the dev bypass (creator-ready persona) and land on /app/library.
 * 2. Start playback from a library preview control.
 * 3. Assert `[data-testid="shell-audio-dock"]` reaches data-state=open, the
 *    main panel's height shrank by the dock height, and every sampled main
 *    content element kept identical x/width.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test audio-dock-layout-stability --project=chromium
 *
 * @stability @smoke
 */

import { expect, test } from '@playwright/test';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/library';

test.use({ storageState: { cookies: [], origins: [] } });

test('audio dock reveal moves only the main panel bottom edge', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/app\/library/, { timeout: 60_000 });

  await expect(page.getByTestId('library-surface')).toBeVisible({
    timeout: 30_000,
  });

  const main = page.locator('#main-content');
  const dock = page.getByTestId('shell-audio-dock');

  // Find a playable preview control. If the persona has no verified audio
  // previews, the playback path cannot be exercised here — skip rather than
  // fail on missing seed data.
  const previewButtons = page.locator(
    '[data-testid^="library-preview-row-"], [data-testid^="library-preview-card-"]'
  );
  if ((await previewButtons.count()) === 0) {
    test.skip(true, 'No library preview assets available for this persona');
    return;
  }

  // Sample main-content geometry before playback starts.
  const contentProbe = page.locator('[data-app-shell-main-content]');
  const probeBefore = await contentProbe.boundingBox();
  const mainBefore = await main.boundingBox();
  expect(probeBefore).not.toBeNull();
  expect(mainBefore).not.toBeNull();

  const firstPreview = previewButtons.first();
  await firstPreview.scrollIntoViewIfNeeded();
  await firstPreview.click({ force: true });

  // The dock opens; the panel bottom slides up in lockstep.
  await expect(dock).toHaveAttribute('data-state', 'open', {
    timeout: 15_000,
  });
  // Wait for the cinematic reveal (~420ms) to settle.
  await page.waitForTimeout(700);

  const probeAfter = await contentProbe.boundingBox();
  const mainAfter = await main.boundingBox();
  const dockBox = await dock.boundingBox();
  expect(probeAfter).not.toBeNull();
  expect(mainAfter).not.toBeNull();
  expect(dockBox).not.toBeNull();

  // No horizontal shift of main content: x and width are identical.
  expect(probeAfter!.x).toBeCloseTo(probeBefore!.x, 0);
  expect(probeAfter!.width).toBeCloseTo(probeBefore!.width, 0);

  // The panel height animates by (approximately) the dock height + the shell
  // gap that separates panel and dock. Allow a couple px of slack for
  // sub-pixel rounding.
  const heightDelta = mainBefore!.height - mainAfter!.height;
  const expectedDelta =
    dockBox!.height + dockBox!.y - mainAfter!.y - mainAfter!.height;
  expect(Math.abs(heightDelta - expectedDelta)).toBeLessThanOrEqual(2);
  expect(heightDelta).toBeGreaterThan(0);

  // Player width = main panel width.
  expect(dockBox!.width).toBeCloseTo(mainAfter!.width, 0);
  expect(dockBox!.x).toBeCloseTo(mainAfter!.x, 0);
});
