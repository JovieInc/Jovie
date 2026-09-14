import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';

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

type Rect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
};

type ElementGeometry = {
  readonly rect: Rect;
  readonly clippingIntersection: Rect;
  readonly clippingAncestorCount: number;
  readonly clippingAncestors: ReadonlyArray<{
    readonly tagName: string;
    readonly className: string;
    readonly overflowX: string;
    readonly overflowY: string;
    readonly rect: Rect;
  }>;
  readonly fullyInsideClippingIntersection: boolean;
  readonly centerTargetIsElement: boolean;
};

function rectanglesOverlap(first: Rect, second: Rect) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

async function measureGeometry(locator: Locator): Promise<ElementGeometry> {
  return locator.evaluate(element => {
    const toRect = (rect: DOMRect): Rect => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });

    const rect = element.getBoundingClientRect();
    const clippingIntersection = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    } satisfies Rect;
    const clippingAncestors: Array<{
      tagName: string;
      className: string;
      overflowX: string;
      overflowY: string;
      rect: Rect;
    }> = [];

    let ancestor = element.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';

      if (clipsX || clipsY) {
        const ancestorRect = ancestor.getBoundingClientRect();
        clippingAncestors.push({
          tagName: ancestor.tagName,
          className: ancestor.className,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          rect: toRect(ancestorRect),
        });
        if (clipsX) {
          clippingIntersection.left = Math.max(
            clippingIntersection.left,
            ancestorRect.left
          );
          clippingIntersection.right = Math.min(
            clippingIntersection.right,
            ancestorRect.right
          );
        }
        if (clipsY) {
          clippingIntersection.top = Math.max(
            clippingIntersection.top,
            ancestorRect.top
          );
          clippingIntersection.bottom = Math.min(
            clippingIntersection.bottom,
            ancestorRect.bottom
          );
        }
      }
      ancestor = ancestor.parentElement;
    }

    clippingIntersection.width = Math.max(
      0,
      clippingIntersection.right - clippingIntersection.left
    );
    clippingIntersection.height = Math.max(
      0,
      clippingIntersection.bottom - clippingIntersection.top
    );

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const centerTarget = document.elementFromPoint(centerX, centerY);

    return {
      rect: toRect(rect),
      clippingIntersection,
      clippingAncestorCount: clippingAncestors.length,
      clippingAncestors,
      fullyInsideClippingIntersection:
        rect.left >= clippingIntersection.left &&
        rect.top >= clippingIntersection.top &&
        rect.right <= clippingIntersection.right &&
        rect.bottom <= clippingIntersection.bottom,
      centerTargetIsElement: centerTarget?.closest('button') === element,
    };
  });
}

async function scrollToBoundary(locator: Locator, boundary: 'top' | 'bottom') {
  const maxScrollTop = await locator.evaluate(element =>
    Math.max(0, element.scrollHeight - element.clientHeight)
  );
  const targetScrollTop = boundary === 'bottom' ? maxScrollTop : 0;

  await locator.evaluate((element, scrollTop) => {
    element.scrollTop = scrollTop;
  }, targetScrollTop);
  await expect
    .poll(() => locator.evaluate(element => element.scrollTop))
    .toBe(targetScrollTop);

  return {
    scrollTop: await locator.evaluate(element => element.scrollTop),
    scrollHeight: await locator.evaluate(element => element.scrollHeight),
    clientHeight: await locator.evaluate(element => element.clientHeight),
    maxScrollTop,
  };
}

async function attachGeometry(
  testInfo: TestInfo,
  name: string,
  value: unknown
) {
  const path = testInfo.outputPath(name);
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
  await testInfo.attach(name, {
    path,
    contentType: 'application/json',
  });
}

async function assertSearchInteraction(
  page: Page,
  testInfo: TestInfo,
  viewportName: string
) {
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
  const firstRow = rows.nth(0);
  const lastRow = rows.nth(4);
  const pasteRow = page.locator('.system-b-spotify-connect-paste-row');
  const searchShell = page.locator('.system-b-spotify-connect-input-shell');
  const claimButton = page.getByRole('button', {
    name: 'Connect Spotify',
    exact: true,
  });
  const dialog = page.locator('[data-slot="dialog-content"]');
  const resultsList = page.locator(
    '.system-b-spotify-connect-dropdown > div[aria-hidden="true"]'
  );

  await expect(firstRow).toBeVisible();
  await expect(lastRow).toBeAttached();
  await expect(pasteRow).toBeAttached();
  await expect(searchShell).toBeVisible();
  await expect(claimButton).toBeVisible();

  // The initial state is the user's natural entry point. It must not depend on
  // scrollIntoViewIfNeeded(), which can place the first row under the trailing
  // action while trying to reveal a later row.
  const dialogTopScroll = await scrollToBoundary(dialog, 'top');
  const resultsTopScroll = await scrollToBoundary(resultsList, 'top');
  const topGeometry = {
    state: 'initial-top',
    dialog: dialogTopScroll,
    resultsList: resultsTopScroll,
    searchShell: await measureGeometry(searchShell),
    claimButton: await measureGeometry(claimButton),
    firstRow: await measureGeometry(firstRow),
    lastRow: await measureGeometry(lastRow),
    pasteRow: await measureGeometry(pasteRow),
  };
  expect(
    topGeometry.firstRow.fullyInsideClippingIntersection,
    JSON.stringify(topGeometry)
  ).toBe(true);
  expect(
    topGeometry.firstRow.centerTargetIsElement,
    JSON.stringify(topGeometry)
  ).toBe(true);
  expect(topGeometry.firstRow.clippingAncestorCount).toBeGreaterThan(0);
  expect(
    rectanglesOverlap(topGeometry.firstRow.rect, topGeometry.searchShell.rect),
    JSON.stringify(topGeometry)
  ).toBe(false);
  expect(
    rectanglesOverlap(topGeometry.firstRow.rect, topGeometry.claimButton.rect),
    JSON.stringify(topGeometry)
  ).toBe(false);
  console.log(`[spotify geometry] ${JSON.stringify(topGeometry)}`);
  await attachGeometry(
    testInfo,
    `spotify-connect-${viewportName}-top-geometry.json`,
    topGeometry
  );
  await attachEvidence(
    page,
    testInfo,
    `spotify-connect-${viewportName}-top.png`
  );

  // Reveal the lower results inside their own scroll owner first, then move
  // the dialog to its outer boundary so the paste action is also reachable in
  // a short viewport. Both scroll positions are user-accessible states.
  const resultsBottomScroll = await scrollToBoundary(resultsList, 'bottom');
  const dialogBottomScroll = await scrollToBoundary(dialog, 'bottom');
  const bottomGeometry = {
    state: 'outer-bottom',
    dialog: dialogBottomScroll,
    resultsList: resultsBottomScroll,
    searchShell: await measureGeometry(searchShell),
    claimButton: await measureGeometry(claimButton),
    firstRow: await measureGeometry(firstRow),
    lastRow: await measureGeometry(lastRow),
    pasteRow: await measureGeometry(pasteRow),
  };
  expect(
    bottomGeometry.lastRow.fullyInsideClippingIntersection,
    JSON.stringify(bottomGeometry)
  ).toBe(true);
  expect(
    bottomGeometry.lastRow.centerTargetIsElement,
    JSON.stringify(bottomGeometry)
  ).toBe(true);
  expect(bottomGeometry.lastRow.clippingAncestorCount).toBeGreaterThan(0);
  expect(
    bottomGeometry.pasteRow.fullyInsideClippingIntersection,
    JSON.stringify(bottomGeometry)
  ).toBe(true);
  expect(
    bottomGeometry.pasteRow.centerTargetIsElement,
    JSON.stringify(bottomGeometry)
  ).toBe(true);
  expect(bottomGeometry.pasteRow.clippingAncestorCount).toBeGreaterThan(0);
  console.log(`[spotify geometry] ${JSON.stringify(bottomGeometry)}`);
  await attachGeometry(
    testInfo,
    `spotify-connect-${viewportName}-bottom-geometry.json`,
    bottomGeometry
  );
  await attachEvidence(
    page,
    testInfo,
    `spotify-connect-${viewportName}-bottom.png`
  );

  await input.focus();
  for (const expectedIndex of [0, 1, 2, 4]) {
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      `spotify-connect-result-${expectedIndex}`
    );
  }
}
test.describe('Spotify connect dialog Storybook behavior', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} keeps results visible and keyboard reachable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await openStory(page);
      await assertSearchInteraction(page, testInfo, viewport.name);
      await assertAccessible(page);
    });
  }
});
