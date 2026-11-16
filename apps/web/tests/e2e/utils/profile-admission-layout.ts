import { expect, type Page, type TestInfo } from '@playwright/test';

export async function waitForSettledProfile(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const nextFrame = () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const readBoxes = () =>
      [
        '[data-testid="public-profile-layout-shell"]',
        '[data-testid="profile-compact-shell"]',
        '[data-testid="profile-desktop-shell"]',
        '[data-testid="claim-banner-cta"]',
      ].map(selector => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
      });

    await nextFrame();
    await nextFrame();
    let previous = JSON.stringify(readBoxes());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await nextFrame();
      const current = JSON.stringify(readBoxes());
      if (current === previous) return;
      previous = current;
    }
  });
}

export async function captureStill(
  page: Page,
  testInfo: TestInfo,
  name: string,
  fullPage = false
) {
  const path = testInfo.outputPath(name);
  const body = await page.screenshot({ fullPage, path });
  await testInfo.attach(name, { contentType: 'image/png', path });
  return body;
}

export async function waitForSettledProfileLayout(
  page: import('@playwright/test').Page,
  expectedLayout: 'compact' | 'desktop'
) {
  const shell = page.getByTestId('public-profile-layout-shell');
  await expect(shell).toHaveAttribute('data-layout', expectedLayout);
  const visibleSurface = page.getByTestId(
    expectedLayout === 'desktop'
      ? 'profile-desktop-surface'
      : 'profile-compact-shell'
  );
  await expect(visibleSurface).toBeVisible();
  await expect(visibleSurface).toHaveAttribute(
    'data-interactive-ready',
    'true'
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
}
