import { expect, type Page, type TestInfo, test } from '@playwright/test';

/**
 * Account surface evidence: the account menu, the What's new banner and the
 * sidebar footer. Every capture lands in test-results and ships in the
 * storybook-browser CI artifact, in both themes at desktop and mobile widths.
 */

const THEMES = ['dark', 'light'] as const;
const VIEWPORTS = [
  ['desktop', { width: 1280, height: 800 }],
  ['mobile', { width: 390, height: 844 }],
] as const;
async function openStory(page: Page, id: string, theme: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator('html')).toHaveClass(new RegExp(theme));
}

async function capture(page: Page, name: string, testInfo: TestInfo) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const [viewportName, viewport] of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`account menu · ${viewportName} · ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const suffix = theme === 'light' ? '-light' : '';
      await openStory(
        page,
        `organisms-userbutton--account-menu${suffix}`,
        theme
      );
      const trigger = page
        .getByTestId('user-button-loaded')
        .getByRole('button')
        .first();
      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem').first()).toBeVisible();

      await capture(page, `account-menu-${viewportName}-${theme}`, testInfo);

      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    });
  }
}

const FOOTER_STORIES = [
  ['whats-new', 'whats-new-only'],
  ['update', 'update-only'],
  ['update-and-whats-new', 'update-and-whats-new'],
  ['all-three', 'all-three'],
] as const;

for (const [viewportName, viewport] of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`sidebar footer · ${viewportName} · ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const suffix = theme === 'light' ? '-light' : '';
      for (const [name, story] of FOOTER_STORIES) {
        await openStory(page, `shell-sidebardock--${story}${suffix}`, theme);
        const rail = page.locator('[data-dock-preview]');
        await expect(rail.locator('[data-dock-card]').first()).toBeVisible();
        await expect(
          rail.getByTestId('user-button-loaded').getByRole('button').first()
        ).toBeVisible();
        const capture = `sidebar-footer-${name}-${viewportName}-${theme}`;
        const path = testInfo.outputPath(`${capture}.png`);
        await rail.screenshot({ path, animations: 'disabled' });
        await testInfo.attach(capture, { path, contentType: 'image/png' });
      }
    });
  }
}

test('the footer update action sits in one fixed 32px slot', async ({
  page,
}) => {
  await openStory(page, 'shell-sidebardock--update-and-whats-new', 'dark');
  const card = page.locator('[data-dock-card="update"]');
  await expect(card).toHaveAttribute('data-slot', 'inset-panel');
  const slot = card.locator('[data-dock-update-slot]');
  await expect(slot).toBeVisible();
  expect((await slot.boundingBox())?.height).toBe(32);
});

test('account loading row is visible on the light sidebar', async ({
  page,
}, testInfo) => {
  await openStory(page, 'organisms-userbutton--loading-row-light', 'light');
  const fills = page.locator('[data-user-button-loading-fill]');
  await expect(fills.first()).toBeVisible();

  // Non-text contrast (WCAG 1.4.11): the resting fill against the sidebar.
  const ratio = await fills.first().evaluate(node => {
    const toRgba = (value: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No 2d context');
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    let surface = { r: 255, g: 255, b: 255, a: 1 };
    for (
      let parent = node.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const colour = toRgba(getComputedStyle(parent).backgroundColor);
      if (colour.a === 1) {
        surface = colour;
        break;
      }
    }
    const fill = toRgba(getComputedStyle(node).backgroundColor);
    const mixed = {
      r: fill.r * fill.a + surface.r * (1 - fill.a),
      g: fill.g * fill.a + surface.g * (1 - fill.a),
      b: fill.b * fill.a + surface.b * (1 - fill.a),
    };
    const [light, dark] = [luminance(mixed), luminance(surface)].sort(
      (a, b) => b - a
    );
    return (light + 0.05) / (dark + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(3);
  await capture(page, 'account-loading-row-light', testInfo);
});
