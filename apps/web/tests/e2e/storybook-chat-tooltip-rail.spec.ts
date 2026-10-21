import { expect, type Page, test } from '@playwright/test';

async function useRealMotion(page: Page) {
  // Storybook freezes animation and forces reduced motion for snapshots.
  // These interaction checks must exercise the browser's real media preference.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: window.matchMedia.bind(window),
      configurable: false,
      writable: false,
    });
    new MutationObserver(() => {
      document
        .querySelectorAll('style[data-jovie-storybook-fixtures]')
        .forEach(node => node.remove());
    }).observe(document, { childList: true, subtree: true });
  });
}

test.beforeEach(async ({ page }) => useRealMotion(page));

const chatsStory =
  '/iframe.html?id=organisms-unifiedsidebar--composed-chats&viewMode=story';

for (const width of [320, 390, 768, 820, 1126]) {
  for (const theme of ['dark', 'light']) {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      test(`chat title eligibility and stable layout at ${width}, ${theme}, ${reducedMotion}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 798 });
        await page.emulateMedia({ reducedMotion });
        await page.addInitScript(
          value => localStorage.setItem('jovie-theme-storybook', value),
          theme
        );
        await page.goto(chatsStory);
        expect(
          await page.evaluate(
            () => matchMedia('(prefers-reduced-motion: reduce)').matches
          )
        ).toBe(reducedMotion === 'reduce');
        const chats = page.getByTestId('chats-page');
        const readable = chats.getByRole('link', {
          name: 'All This Noise EP',
          exact: true,
        });
        await expect(readable).toBeVisible({ timeout: 90_000 });
        await page.evaluate(() => document.fonts.ready);
        const before = await chats.boundingBox();
        await readable.hover();
        await readable.focus();
        await expect(page.getByTestId('tooltip-content')).toHaveCount(0);
        const clipped = chats.getByRole('link', {
          name: /^Plan the autumn release/,
        });
        await clipped.focus();
        const hint = page.getByTestId('tooltip-content');
        await expect(hint).toBeVisible();
        await expect(hint).toHaveAttribute('data-side', 'bottom');
        await expect(hint).toHaveAttribute('data-align', 'start');
        expect(await chats.boundingBox()).toEqual(before);
        await clipped.press('Escape');
        await expect(hint).toHaveCount(0);
        await expect(clipped).toBeFocused();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          )
        ).toBe(false);
        await page.screenshot({
          path: testInfo.outputPath(
            `chats-${width}-${theme}-${reducedMotion}.png`
          ),
        });
        if (width >= 1024) {
          const collapse = page.getByRole('button', {
            name: 'Collapse sidebar',
            exact: true,
          });
          await collapse.click();
          const rail = page.locator('[data-rail-preview-region="left"]');
          await expect(rail).toHaveAttribute('data-rail-pinned', 'false');
          const account = rail
            .locator('[data-sidebar="footer"] button[aria-haspopup="menu"]')
            .first();
          await account.click();
          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible();
          const railBefore = await rail.boundingBox();
          await menu.hover({ position: { x: 250, y: 80 } });
          await page.waitForTimeout(500);
          expect(await rail.boundingBox()).toEqual(railBefore);
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await expect(account).toBeFocused();
        }
      });
    }
  }
}

test('a real Radix owned submenu retains the preview then releases on dismissal', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=shell-appshellrightrail--owned-menu-preview&viewMode=story'
  );
  const rail = page.getByTestId('owned-menu-rail');
  const trigger = page.getByRole('button', { name: 'Rail account' });
  await expect(trigger).toBeVisible({ timeout: 90_000 });
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Preferences' }).hover();
  const submenuItem = page.getByRole('menuitem', {
    name: 'Keyboard shortcuts',
  });
  await submenuItem.hover();
  await page.waitForTimeout(500);
  await expect(rail).toHaveAttribute('data-preview', 'true');
  await expect(rail).toHaveAttribute('data-pinned', 'false');
  await page.keyboard.press('Escape');
  await expect(submenuItem).toBeHidden();
  await expect(rail).toHaveAttribute('data-preview', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Outside rail' }).focus();
  await page.mouse.move(1, 1);
  await expect(rail).toHaveAttribute('data-preview', 'false');
});

test('hybrid touch activates chat actions first and keyboard hints return', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 820, height: 798 },
  });
  const page = await context.newPage();
  await useRealMotion(page);
  await page.goto(`http://127.0.0.1:6006${chatsStory}`);
  const chats = page.getByTestId('chats-page');
  const actions = chats.getByRole('button', {
    name: 'Chat Actions for All This Noise EP',
  });
  await expect(actions).toBeVisible({ timeout: 90_000 });
  expect(
    await actions.evaluate(element => getComputedStyle(element).opacity)
  ).toBe('1');
  await actions.tap();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByTestId('tooltip-content')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const clipped = chats.getByRole('link', { name: /^Plan the autumn release/ });
  await actions.focus();
  await page.keyboard.press('Tab');
  await expect(clipped).toBeFocused();
  await expect(page.getByTestId('tooltip-content')).toBeVisible();
  await clipped.press('Escape');
  await clipped.hover();
  await expect(page.getByTestId('tooltip-content')).toBeVisible();
  await context.close();
});

test('fitting after resize closes a hint and reclipping waits for fresh intent', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 798 });
  await page.goto(chatsStory);
  const clipped = page
    .getByTestId('chats-page')
    .getByRole('link', { name: /^Plan the autumn release/ });
  await expect(clipped).toBeVisible({ timeout: 90_000 });
  await clipped.focus();
  await expect(page.getByTestId('tooltip-content')).toBeVisible();
  await page.setViewportSize({ width: 2400, height: 798 });
  await expect(page.getByTestId('tooltip-content')).toHaveCount(0);
  await page.setViewportSize({ width: 820, height: 798 });
  await expect(page.getByTestId('tooltip-content')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(clipped).toBeFocused();
  await expect(page.getByTestId('tooltip-content')).toBeVisible();
});
