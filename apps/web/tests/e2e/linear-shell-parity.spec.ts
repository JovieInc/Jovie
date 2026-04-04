import { expect, type Locator, type Page, test } from '@playwright/test';

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

async function expectPillChrome(locator: Locator) {
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
  expect(hasVisibleShadow(metrics.boxShadow)).toBeTruthy();
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

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: /demo toolbar pills and release drawer follow parity invariants`, async ({
    page,
  }) => {
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await setTheme(page, theme);

    const displayButton = page.getByRole('button', { name: 'Display' }).first();
    const previewButton = page
      .getByRole('button', { name: 'Toggle release preview' })
      .first();

    await expect(displayButton).toBeVisible();
    await expect(previewButton).toBeVisible();
    await expectPillChrome(displayButton);
    await expectPillChrome(previewButton);

    await page.getByText('Static Skies').first().click();

    const drawer = page.getByTestId('release-sidebar');
    await expect(drawer).toBeVisible();

    const actionBar = drawer.getByTestId('drawer-card-action-bar');
    await expect(actionBar).toBeVisible();
    await expect(drawer.getByText('Static Skies', { exact: true })).toHaveCount(
      1
    );
    await expect(drawer.getByTestId('release-tab-panel-card')).toHaveCount(0);

    const detailsTab = drawer.getByTestId('drawer-tab-details');
    const platformsTab = drawer.getByTestId('drawer-tab-links');
    const metadataCard = drawer.getByTestId('release-metadata-card');
    await expect(detailsTab).toBeVisible();
    await expect(platformsTab).toBeVisible();
    await expectFlatPillChrome(detailsTab);
    await expectFlatPillChrome(platformsTab);
    await expect(metadataCard).toBeVisible();
    await expectCardChrome(metadataCard);

    const copySmartLinkButton = drawer.getByRole('button', {
      name: 'Copy smart link',
    });
    await expect(copySmartLinkButton).toBeVisible();
    await expectFlatPillChrome(copySmartLinkButton);

    expect(
      await livesInsideRoundedCard(
        drawer.getByText('Static Skies', { exact: true }).first()
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

    const drawer = page.getByTestId('demo-analytics-sidebar');
    await expect(drawer).toBeVisible();

    const rangeButton = drawer
      .locator('button')
      .filter({ hasText: '30d' })
      .first();
    await expect(rangeButton).toBeVisible();
    await expectFlatPillChrome(rangeButton);

    const tabbedCard = drawer.getByTestId('demo-analytics-tabbed-card');
    await expect(tabbedCard).toBeVisible();
    await expectCardChrome(tabbedCard);
    await expect(tabbedCard.getByRole('tab', { name: 'Cities' })).toBeVisible();
    await expect(tabbedCard.getByText('Los Angeles')).toBeVisible();

    expect(
      await livesInsideRoundedCard(drawer.getByText('Audience funnel'))
    ).toBeTruthy();
    expect(await livesInsideRoundedCard(rangeButton)).toBeTruthy();
    expect(
      await livesInsideRoundedCard(tabbedCard.getByText('Los Angeles'))
    ).toBeTruthy();
  });
}
