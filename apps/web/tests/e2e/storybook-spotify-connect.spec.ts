import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';

const STORY_ID = 'features-dashboard-releases-spotifyconnectdialog--default';
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'short-viewport', width: 390, height: 520 },
] as const;
async function openStory(page: Page) {
  await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 60_000 });
}
async function attachEvidence(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ animations: 'disabled', path });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}
async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(
    results.violations,
    results.violations.map(violation => violation.id).join(', ')
  ).toEqual([]);
}

async function assertSearchInteraction(page: Page) {
  const input = page.getByRole('combobox', {
    name: 'Search Spotify artists or paste a link',
  });
  await input.fill('tim white');

  const dropdown = page.locator('.system-b-spotify-connect-dropdown');
  await expect(dropdown).toBeVisible();
  await expect(dropdown).toHaveCSS('position', 'static');
  await expect(
    page
      .locator('.system-b-spotify-connect-result-row')
      .filter({ hasText: 'Tim White' })
  ).toBeEnabled();
  await expect(
    page
      .locator('.system-b-spotify-connect-result-row')
      .filter({ hasText: 'Other Owner' })
  ).toBeDisabled();

  const rows = page.locator('.system-b-spotify-connect-result-row');
  await expect(rows).toHaveCount(5);
  const lastRow = rows.nth(4);
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeVisible();

  const lastRowVisibility = await lastRow.evaluate(element => {
    const clips = (value: string) => value !== 'visible';
    const rect = element.getBoundingClientRect();
    const clipRect = [0, 0, window.innerWidth, window.innerHeight];
    let clippingAncestorCount = 0;
    let ancestor = element.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clipsX = clips(style.overflowX),
        clipsY = clips(style.overflowY);
      if (!clipsX && !clipsY) {
        ancestor = ancestor.parentElement;
        continue;
      }
      clippingAncestorCount += 1;
      const ancestorRect = ancestor.getBoundingClientRect();
      if (clipsX) {
        clipRect[0] = Math.max(clipRect[0], ancestorRect.left);
        clipRect[2] = Math.min(clipRect[2], ancestorRect.right);
      }
      if (clipsY) {
        clipRect[1] = Math.max(clipRect[1], ancestorRect.top);
        clipRect[3] = Math.min(clipRect[3], ancestorRect.bottom);
      }
      ancestor = ancestor.parentElement;
    }
    return {
      fitsClippingAncestors:
        rect.left >= clipRect[0] &&
        rect.top >= clipRect[1] &&
        rect.right <= clipRect[2] &&
        rect.bottom <= clipRect[3],
      clippingAncestorCount,
      pointerTargetIsRow:
        document
          .elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          )
          ?.closest('button') === element,
    };
  });
  expect(
    lastRowVisibility.fitsClippingAncestors,
    JSON.stringify(lastRowVisibility)
  ).toBe(true);
  expect(lastRowVisibility.clippingAncestorCount).toBeGreaterThan(0);
  expect(lastRowVisibility.pointerTargetIsRow).toBe(true);

  await input.focus();
  for (let index = 0; index < 4; index += 1) {
    await input.press('ArrowDown');
  }
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    'spotify-connect-result-4'
  );
}
test.describe('Spotify connect dialog Storybook behavior', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} keeps results visible and keyboard reachable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await openStory(page);
      await assertSearchInteraction(page);
      await assertAccessible(page);
      await attachEvidence(
        page,
        testInfo,
        `spotify-connect-${viewport.name}.png`
      );
    });
  }
});
