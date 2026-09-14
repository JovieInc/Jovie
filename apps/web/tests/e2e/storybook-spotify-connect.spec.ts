import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';

const STORY_ID = 'features-dashboard-releases-spotifyconnectdialog--default';
const EVIDENCE_DIR = join('test-results', 'storybook-spotify-connect-evidence');
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
  const screenshot = await page.screenshot({ animations: 'disabled' });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: 'image/png',
  });
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, name), screenshot);
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

  const geometry = await dropdown.evaluate(element => {
    const dropdownRect = element.getBoundingClientRect();
    const dialog = element.closest('[role="dialog"]');
    const dialogRect = dialog?.getBoundingClientRect();
    return {
      dropdownPosition: getComputedStyle(element).position,
      dropdownBottom: dropdownRect.bottom,
      dialogBottom: dialogRect?.bottom ?? null,
      dialogClientHeight: dialog?.clientHeight ?? 0,
      dialogScrollHeight: dialog?.scrollHeight ?? 0,
    };
  });

  expect(geometry.dropdownPosition).toBe('static');
  if (page.viewportSize()?.height === 520) {
    expect(geometry.dialogScrollHeight).toBeGreaterThan(
      geometry.dialogClientHeight
    );
  } else {
    expect(geometry.dropdownBottom).toBeLessThanOrEqual(
      geometry.dialogBottom ?? Number.POSITIVE_INFINITY
    );
  }

  const rows = page.locator('.system-b-spotify-connect-result-row');
  await expect(rows).toHaveCount(5);
  const lastRow = rows.nth(4);
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeVisible();

  const lastRowInteraction = await lastRow.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      intersectsViewport:
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth,
      pointerTargetIsRow: hit === element || hit?.closest('button') === element,
    };
  });
  expect(lastRowInteraction.intersectsViewport).toBe(true);
  expect(lastRowInteraction.pointerTargetIsRow).toBe(true);

  await input.focus();
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    'spotify-connect-result-0'
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
