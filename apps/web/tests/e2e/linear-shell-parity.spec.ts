import { expect, type Locator, type Page, test } from '@playwright/test';
import { DEMO_RELEASE_VIEW_MODELS } from '@/features/demo/mock-release-data';

// Intentional exception: this suite locks design-system parity across demo
// surfaces, so computed-style assertions are the contract under test.
test.use({ storageState: { cookies: [], origins: [] } });

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(value => {
    if (value === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, theme);
}

async function expectQuietToolbarActionChrome(locator: Locator) {
  const metrics = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      height: Number.parseFloat(style.height),
      radius: Number.parseFloat(style.borderTopLeftRadius),
      borderTop: Number.parseFloat(style.borderTopWidth),
      boxShadow: style.boxShadow,
    };
  });

  expect(metrics.height).toBeGreaterThanOrEqual(27);
  expect(metrics.height).toBeLessThanOrEqual(29.5);
  expect(metrics.radius).toBeGreaterThanOrEqual(999);
  expect(metrics.borderTop).toBe(0);
  expect(hasVisibleShadow(metrics.boxShadow)).toBeFalsy();
}

function hasVisibleShadow(boxShadow: string) {
  if (boxShadow === 'none') return false;

  const segments = splitShadowLayers(boxShadow);

  return segments.some(segment => {
    const alphaMatch = segment.match(
      /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([0-9.]+))?\s*\)/u
    );
    const alpha = alphaMatch?.[1] === undefined ? 1 : Number(alphaMatch[1]);
    const pxValues = [...segment.matchAll(/-?\d+(?:\.\d+)?px/gu)].map(match =>
      Number(match[0].slice(0, -2))
    );
    const hasOffset = (pxValues[0] ?? 0) !== 0 || (pxValues[1] ?? 0) !== 0;
    return alpha > 0 && hasOffset;
  });
}

function splitShadowLayers(boxShadow: string) {
  const layers: string[] = [];
  let currentLayer = '';
  let depth = 0;

  for (const character of boxShadow) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    } else if (character === ',' && depth === 0) {
      layers.push(currentLayer.trim());
      currentLayer = '';
      continue;
    }

    currentLayer += character;
  }

  if (currentLayer.trim()) {
    layers.push(currentLayer.trim());
  }

  return layers;
}

async function expectFlatPillChrome(locator: Locator) {
  const metrics = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      height: Number.parseFloat(style.height),
      radius: Number.parseFloat(style.borderTopLeftRadius),
      borderTop: Number.parseFloat(style.borderTopWidth),
      boxShadow: style.boxShadow,
    };
  });

  expect(metrics.height).toBeGreaterThanOrEqual(27);
  expect(metrics.height).toBeLessThanOrEqual(29.5);
  expect(metrics.radius).toBeGreaterThanOrEqual(999);
  expect(metrics.borderTop).toBeGreaterThan(0);
  expect(hasVisibleShadow(metrics.boxShadow)).toBeFalsy();
}

async function expectCardChrome(locator: Locator) {
  const metrics = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      radius: Number.parseFloat(style.borderTopLeftRadius),
      borderTop: Number.parseFloat(style.borderTopWidth),
      boxShadow: style.boxShadow,
    };
  });

  expect(metrics.radius).toBeGreaterThanOrEqual(9.5);
  expect(metrics.borderTop).toBeGreaterThan(0);
  expect(metrics.boxShadow).not.toBe('none');
}

async function livesInsideRoundedCard(locator: Locator) {
  return locator.evaluate(node => {
    let current: HTMLElement | null = node as HTMLElement;
    while (current) {
      const radius = Number.parseFloat(
        getComputedStyle(current).borderTopLeftRadius
      );
      if (radius >= 10) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  });
}

function getPrimaryReleaseTitle() {
  const primaryReleaseTitle = DEMO_RELEASE_VIEW_MODELS[0]?.title;

  expect(
    primaryReleaseTitle,
    'Expected at least one demo release fixture'
  ).toBeTruthy();

  return primaryReleaseTitle!;
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: /demo toolbar pills and release drawer follow parity invariants`, async ({
    page,
  }) => {
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await setTheme(page, theme);

    const primaryReleaseTitle = getPrimaryReleaseTitle();
    const firstReleaseRow = page.getByTestId('release-row');
    await expect(firstReleaseRow).toBeVisible();
    await expect(
      firstReleaseRow.getByText(primaryReleaseTitle, { exact: true })
    ).toBeVisible();

    const displayButton = page
      .locator('button[aria-label="Display"]:visible')
      .last();
    const previewButton = page
      .locator('button[aria-label="Toggle release preview"]:visible')
      .last();
    const hasDisplayButton = (await displayButton.count()) > 0;

    await expect(previewButton).toBeVisible();
    await expect(previewButton).toBeEnabled();
    await expectQuietToolbarActionChrome(previewButton);
    if (hasDisplayButton) {
      await expect(displayButton).toBeEnabled();
      await expectQuietToolbarActionChrome(displayButton);
    }

    await previewButton.click();

    const drawer = page.getByTestId('release-sidebar');
    await expect(drawer).toBeVisible();

    const actionBar = drawer.getByTestId('drawer-card-action-bar');
    await expect(actionBar).toBeVisible();
    await expect(
      drawer.getByText(primaryReleaseTitle, { exact: true }).first()
    ).toBeVisible();
    await expect(drawer.getByTestId('release-header-card')).toBeVisible();
    await expect(drawer.getByTestId('release-tab-panel-card')).toHaveCount(0);

    const tracksTab = drawer.getByTestId('drawer-tab-tracks');
    const platformsTab = drawer.getByTestId('drawer-tab-links');
    const propertiesCard = drawer.getByTestId('release-properties-card');
    await expect(tracksTab).toBeVisible();
    await expect(platformsTab).toBeVisible();
    await expectFlatPillChrome(tracksTab);
    await expectFlatPillChrome(platformsTab);
    await expect(propertiesCard).toBeVisible();
    await expectCardChrome(propertiesCard);

    const copySmartLinkButton = drawer.getByRole('button', {
      name: 'Copy smart link',
    });
    await expect(copySmartLinkButton).toBeVisible();
    await expectFlatPillChrome(copySmartLinkButton);

    expect(
      await livesInsideRoundedCard(
        drawer.getByText(primaryReleaseTitle, { exact: true }).first()
      )
    ).toBeTruthy();
    expect(
      await livesInsideRoundedCard(
        drawer.getByTestId('release-smart-link-analytics')
      )
    ).toBeTruthy();
  });

  test(`${theme}: /demo/audience analytics drawer uses minimal top chrome and card surfaces`, async ({
    page,
  }) => {
    await page.goto('/demo/audience', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await setTheme(page, theme);

    await expect(page.getByTestId('demo-audience-shell')).toBeVisible();

    const drawer = page.getByTestId('demo-analytics-sidebar');
    const drawerInitiallyVisible = await drawer.isVisible().catch(() => false);
    const analyticsToggle = page
      .locator(
        'button[aria-label=\"Open analytics panel\"]:visible, button[aria-label=\"Close analytics panel\"]:visible'
      )
      .last();
    if (!drawerInitiallyVisible) {
      await expect(analyticsToggle).toBeVisible();
      await analyticsToggle.click();
    }

    await expect(drawer).toBeVisible({ timeout: 15_000 });

    const tabbedCard = drawer.getByTestId('demo-analytics-tabbed-card');
    await expect(tabbedCard).toBeVisible();
    await expectCardChrome(tabbedCard);
    await expect(tabbedCard.getByRole('tab', { name: 'Cities' })).toBeVisible();
    await expect(tabbedCard.getByText('Los Angeles')).toBeVisible();

    expect(
      await livesInsideRoundedCard(drawer.getByText('Audience funnel'))
    ).toBeTruthy();
    expect(
      await livesInsideRoundedCard(tabbedCard.getByText('Los Angeles'))
    ).toBeTruthy();
  });
}
