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
 * The second test (JOV-9028) guards the shell elevation correction: the
 * player lives on the shell's surface-0 plane — flat chrome, not an elevated
 * card — and the main panel ends cleanly above it with controls fully
 * visible across the state matrix (player collapsed/expanded × sidebar
 * open/closed, and a narrow desktop width).
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

  const firstPreview = await findLibraryPreview(page);
  if (firstPreview === null) return;

  const main = page.locator('#main-content');
  const dock = page.getByTestId('shell-audio-dock');

  // Sample main-content geometry before playback starts.
  const contentProbe = page.locator('[data-app-shell-main-content]');
  const probeBefore = await contentProbe.boundingBox();
  const mainBefore = await main.boundingBox();
  expect(probeBefore).not.toBeNull();
  expect(mainBefore).not.toBeNull();

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

/**
 * Land on /app/library with the creator-ready persona and find a playable
 * preview control. If the persona has no verified audio previews, the
 * playback path cannot be exercised here — skip rather than fail on missing
 * seed data. Returns the first preview locator (not yet clicked) or null.
 */
async function findLibraryPreview(page: import('@playwright/test').Page) {
  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/app\/library/, { timeout: 60_000 });

  await expect(page.getByTestId('library-surface')).toBeVisible({
    timeout: 30_000,
  });

  const previewButtons = page.locator(
    '[data-testid^="library-preview-row-"], [data-testid^="library-preview-card-"]'
  );
  if ((await previewButtons.count()) === 0) {
    test.skip(true, 'No library preview assets available for this persona');
    return null;
  }

  return previewButtons.first();
}

test('player sits flat on the surface-0 shell plane and the main panel ends cleanly above it (JOV-9028)', async ({
  page,
}) => {
  test.setTimeout(120_000);

  // The desktop shell dock is the lg+ surface. Pin a desktop viewport so this
  // guard runs on every project, including a narrow default viewport.
  const current = page.viewportSize();
  const viewport =
    current && current.width >= 1024 ? current : { width: 1280, height: 800 };
  if (!current || current.width < 1024) {
    await page.setViewportSize(viewport);
  }

  const firstPreview = await findLibraryPreview(page);
  if (firstPreview === null) return;
  await firstPreview.scrollIntoViewIfNeeded();
  await firstPreview.click({ force: true });

  const main = page.locator('#main-content');
  const dock = page.getByTestId('shell-audio-dock');

  await expect(dock).toHaveAttribute('data-state', 'open', {
    timeout: 15_000,
  });
  // Wait for the cinematic reveal (~420ms) to settle.
  await page.waitForTimeout(700);

  // Rendered surface proof: the dock's plane IS the surface-0 token —
  // flat shell chrome, not an elevated card (no radius, no shadow).
  const surface = await page.evaluate(() => {
    const dockEl = document.querySelector('[data-shell-audio-dock]');
    if (!dockEl) return null;
    const probe = document.createElement('div');
    probe.className = 'bg-surface-0';
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const surface0 = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const styles = getComputedStyle(dockEl);
    return {
      dockBg: styles.backgroundColor,
      surface0,
      radius: styles.borderRadius,
      shadow: styles.boxShadow,
      marginTop: styles.marginTop,
    };
  });
  expect(surface).not.toBeNull();
  expect(surface!.dockBg).toBe(surface!.surface0);
  expect(parseFloat(surface!.radius)).toBe(0);
  expect(surface!.shadow).toBe('none');

  async function assertCleanBoundary() {
    const mainBox = await main.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(mainBox).not.toBeNull();
    expect(dockBox).not.toBeNull();

    // The main panel ends cleanly above the player: no overlap, and the
    // seam between them is exactly the dock's animated shell-gap margin —
    // boundaries stay on the grid.
    const seam = dockBox!.y - (mainBox!.y + mainBox!.height);
    expect(seam).toBeGreaterThanOrEqual(-0.5);
    const gapMargin = await page.evaluate(() => {
      const dockEl = document.querySelector('[data-shell-audio-dock]');
      return dockEl ? getComputedStyle(dockEl).marginTop : '0px';
    });
    expect(Math.abs(seam - parseFloat(gapMargin))).toBeLessThanOrEqual(0.5);

    // The dock spans the main column — no rogue card inset.
    expect(dockBox!.width).toBeCloseTo(mainBox!.width, 0);
    expect(dockBox!.x).toBeCloseTo(mainBox!.x, 0);

    // Controls fully visible: real boxes, fully inside the dock row and the
    // viewport — no overlap with main content, no clipping.
    const controls = [
      '[data-testid="player-visibility-toggle"]',
      '[data-testid="audio-player-dismiss"]',
    ];
    const viewportHeight = page.viewportSize()?.height ?? 720;
    for (const selector of controls) {
      const control = page.locator(selector).first();
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
      expect(box!.y).toBeGreaterThanOrEqual(dockBox!.y - 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        dockBox!.y + dockBox!.height + 0.5
      );
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight);
    }

    return { mainBox, dockBox };
  }

  const expandedOpen = await assertCleanBoundary();

  // Sidebar collapsed (icon rail): boundaries and control visibility hold.
  const sidebarToggle = page.getByTestId('sidebar-rail-toggle');
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
    await page.waitForTimeout(500);
    const collapsedSidebar = await assertCleanBoundary();
    expect(collapsedSidebar.mainBox!.width).toBeGreaterThan(
      expandedOpen.mainBox!.width
    );
    await sidebarToggle.click();
    await page.waitForTimeout(500);
    await assertCleanBoundary();
  }

  // Narrow desktop width: the boundary holds at the lg floor.
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.waitForTimeout(300);
  await assertCleanBoundary();
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.waitForTimeout(300);

  // Player collapsed (chevron → sidebar mini): the dock collapses to zero
  // height with no reserved space, and the main panel reclaims it cleanly.
  await page.getByTestId('player-visibility-toggle').click();
  await expect(dock).toHaveAttribute('data-state', 'closed');
  await page.waitForTimeout(500);

  const closedDockBox = await dock.boundingBox();
  expect(
    closedDockBox === null || closedDockBox.height <= 0.5,
    'closed dock must reserve zero height'
  ).toBe(true);
  const mainClosed = await main.boundingBox();
  expect(mainClosed).not.toBeNull();
  expect(mainClosed!.height).toBeGreaterThan(expandedOpen.mainBox!.height);
});
