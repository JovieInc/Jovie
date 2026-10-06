import { expect, test } from '@playwright/test';

// Actual component stories, independent of IS_E2E's shell-banner suppression.
// These are implementation captures; there is no approved Pen binding yet.
for (const theme of ['dark', 'light'] as const) {
  test(`What's New fits its dock and exposes the agreed control in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      value => localStorage.setItem('jovie-theme-storybook', value),
      theme
    );
    for (const story of ['single-update', 'long-title']) {
      await page.goto(
        `/iframe.html?id=organisms-whatsnewbanner--${story}&viewMode=story`
      );
      const banner = page.getByTestId('whats-new-banner');
      await expect(banner).toBeVisible();
      const dockWidth = await banner.evaluate(node => {
        const width = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--app-shell-sidebar-width'
          )
        );
        return {
          actual: node.parentElement?.getBoundingClientRect().width,
          expected: width,
          ancestors: [
            node.parentElement,
            node.parentElement?.parentElement,
          ].map(parent => ({
            tag: parent?.tagName,
            style: parent?.getAttribute('style'),
            className: parent?.className,
          })),
        };
      });
      await testInfo.attach('dock-geometry', {
        body: JSON.stringify(dockWidth),
        contentType: 'application/json',
      });
      expect(dockWidth.actual).toBe(dockWidth.expected);
      await testInfo.attach(
        `${process.env.JOVIE_CAPTURE_STAGE ?? 'after'}-${theme}-${story}.png`,
        {
          body: await banner.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        }
      );
      const overflow = await banner.evaluate(
        node => node.scrollWidth > node.clientWidth
      );
      expect(overflow).toBe(false);
      const dismiss = page.getByRole('button', { name: "Dismiss What's New" });
      const box = await dismiss.boundingBox();
      expect(box?.width).toBe(28);
      expect(box?.height).toBe(28);
      await dismiss.focus();
      await expect(dismiss).toBeFocused();
    }
  });
}

test('actual fetching container preserves drafts and returns dismissal focus without stale replay', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/iframe.html?id=organisms-whatsnewbanner--actual-container&viewMode=story'
  );
  const banner = page.getByTestId('whats-new-banner');
  await expect(banner).toBeVisible();
  const draft = page.getByRole('textbox', { name: 'Draft' });
  await draft.fill('Retained notes');
  await page.getByRole('button', { name: 'Disable updates' }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: 'Enable updates' }).click();
  await expect(banner).toHaveCount(0);
  await expect(banner).toBeVisible();
  await page.getByRole('button', { name: 'Sidebar', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: 'Sidebar', exact: true }).click();
  await expect(banner).toBeVisible();
  await testInfo.attach('actual-container.png', {
    body: await page.locator('#storybook-root').screenshot(),
    contentType: 'image/png',
  });
  await page.getByTestId('whats-new-banner-link').focus();
  await page.keyboard.press('Escape');
  await expect(banner).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Sidebar', exact: true })
  ).toBeFocused();
  await expect(draft).toHaveValue('Retained notes');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Draft' })).toBeVisible();
  // Reload respects the persisted seen release, after the loading delay too.
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('jovie.whatsNew.lastSeenId'))
    )
    .toBe('26.9.2');
  await page.waitForTimeout(1600);
  await expect(banner).toHaveCount(0);
});
