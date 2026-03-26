import { expect, type Locator, type Page, test } from '@playwright/test';

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

    const copySmartLinkButton = drawer.getByRole('button', {
      name: 'Copy smart link',
    });
    await expect(copySmartLinkButton).toBeVisible();
    await expectPillChrome(copySmartLinkButton);

    expect(
      await livesInsideRoundedCard(
        drawer.getByText('Static Skies', { exact: true }).first()
      )
    ).toBeTruthy();
    expect(
      await livesInsideRoundedCard(drawer.getByText('Analytics').first())
    ).toBeTruthy();
  });

  test(`${theme}: /demo/audience analytics drawer uses minimal top chrome and card surfaces`, async ({
    page,
  }) => {
    await page.goto('/demo/audience', { waitUntil: 'domcontentloaded' });
    await setTheme(page, theme);

    const drawer = page.getByTestId('demo-analytics-sidebar');
    await expect(drawer).toBeVisible();

    const rangeButton = drawer
      .locator('button')
      .filter({ hasText: '30d' })
      .first();
    await expect(rangeButton).toBeVisible();
    await expectPillChrome(rangeButton);

    const tabsCard = drawer.getByTestId('entity-sidebar-tabs-card');
    await expect(tabsCard).toBeVisible();

    expect(
      await livesInsideRoundedCard(drawer.getByText('Audience funnel'))
    ).toBeTruthy();
    expect(await livesInsideRoundedCard(rangeButton)).toBeTruthy();
  });
}
