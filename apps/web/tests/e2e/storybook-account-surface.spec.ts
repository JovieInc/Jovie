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

for (const [theme, surface] of [
  ['light', 'sidebar'],
  ['dark', 'sidebar'],
  ['light', 'page'],
  ['dark', 'page'],
] as const) {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`account loading contrast · ${theme} · ${surface} · ${reducedMotion}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openStory(
        page,
        `organisms-userbutton--loading-row-${surface === 'page' ? 'page-' : ''}${theme}`,
        theme
      );
      await page.emulateMedia({ reducedMotion });
      const row = page.getByTestId('user-button-loading');
      const fills = row.locator('[data-user-button-loading-fill]');
      await expect(fills).toHaveCount(2);
      await expect(fills.first()).toBeVisible();
      expect((await row.boundingBox())?.height).toBe(32);
      // Restore production CSS; the catalog otherwise disables every pulse.
      await page
        .locator('style[data-jovie-storybook-fixtures]')
        .evaluateAll(styles => styles.forEach(style => style.remove()));

      // Measure both rendered fills, including their opacity throughout the
      // pulse. Reduced-motion screenshots alone hide a fading-contrast bug.
      const measurements = [];
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        const samples = await fills.evaluateAll((nodes, phase) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('No 2d context');
          const toRgba = (value: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
            return { r, g, b, a: a / 255 };
          };
          type Color = ReturnType<typeof toRgba>;
          const composite = (front: Color, back: Color): Color => ({
            r: front.r * front.a + back.r * (1 - front.a),
            g: front.g * front.a + back.g * (1 - front.a),
            b: front.b * front.a + back.b * (1 - front.a),
            a: 1,
          });
          const luminance = ({ r, g, b }: Color) => {
            const channel = (value: number) => {
              const s = value / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return (
              0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
            );
          };
          return nodes.map(node => {
            const ancestors: Element[] = [];
            for (
              let parent = node.parentElement;
              parent;
              parent = parent.parentElement
            )
              ancestors.unshift(parent);
            for (const element of [...ancestors, node]) {
              for (const animation of element.getAnimations()) {
                const duration = animation.effect?.getComputedTiming().duration;
                if (typeof duration === 'number' && Number.isFinite(duration)) {
                  animation.pause();
                  animation.currentTime = duration * phase;
                }
              }
            }
            let surface = { r: 255, g: 255, b: 255, a: 1 };
            let opacity = Number(getComputedStyle(node).opacity);
            for (const parent of ancestors) {
              const style = getComputedStyle(parent);
              surface = composite(toRgba(style.backgroundColor), surface);
              opacity *= Number(style.opacity);
            }
            const background = getComputedStyle(node).backgroundColor;
            const fill = toRgba(background);
            const mixed = composite({ ...fill, a: fill.a * opacity }, surface);
            const [light, dark] = [luminance(mixed), luminance(surface)].sort(
              (a, b) => b - a
            );
            return {
              background,
              opacity,
              surface,
              mixed,
              ratio: (light + 0.05) / (dark + 0.05),
            };
          });
        }, phase);
        measurements.push({ phase, samples });
      }
      await testInfo.attach(
        `loading-contrast-${theme}-${surface}-${reducedMotion}.json`,
        {
          body: JSON.stringify(measurements, null, 2),
          contentType: 'application/json',
        }
      );
      await capture(
        page,
        `account-loading-${theme}-${surface}-${reducedMotion}`,
        testInfo
      );
      for (const { phase, samples } of measurements) {
        for (const [index, sample] of samples.entries()) {
          expect(
            sample.ratio,
            `${theme} ${reducedMotion} fill ${index} phase ${phase}: ${JSON.stringify(sample)}`
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
}

// The actual 224px sidebar leaves 208px after its horizontal inset.
for (const [viewportName, viewport] of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`Mac account identity and keyboard · ${viewportName} · ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      for (const state of ['', '-long-name', '-no-username']) {
        const suffix = theme === 'light' ? '-light' : '';
        await openStory(
          page,
          `organisms-userbutton--mac-account-menu${state}${suffix}`,
          theme
        );
        const trigger = page
          .getByTestId('user-button-loaded')
          .getByRole('button')
          .first();
        await trigger.focus();
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        const profile = menu.getByRole('menuitem', {
          name: /Open profile for/,
        });
        await expect(profile.getByText('Pro', { exact: true })).toBeVisible();
        await expect(
          menu.getByRole('menuitem', { name: 'Install iOS Alpha' })
        ).toBeVisible();
        await expect(
          menu.getByRole('menuitem', { name: 'Manage billing' })
        ).toBeVisible();
        await expect(
          menu.getByTestId('electron-release-identity')
        ).toBeVisible();
        const usage = menu.getByRole('button', { name: /Usage remaining/ });
        const usageArrow = await usage.locator('svg').last().boundingBox();
        const supportArrow = await menu
          .getByRole('menuitem', { name: 'Learn More' })
          .locator('svg')
          .last()
          .boundingBox();
        expect(
          Math.abs(
            usageArrow!.x +
              usageArrow!.width -
              supportArrow!.x -
              supportArrow!.width
          )
        ).toBeLessThanOrEqual(2);
        const name = profile.locator('[title]');
        const fits = await name.evaluate(
          node => node.scrollWidth <= node.clientWidth
        );
        expect(fits).toBe(state !== '-long-name');
        if (state === '-no-username')
          await expect(profile).not.toContainText('@');
        const geometry = await menu.evaluate(node => ({
          width: node.getBoundingClientRect().width,
          overflow: node.scrollWidth > node.clientWidth,
          separators: [...node.querySelectorAll('[role="separator"]')].map(
            separator => separator.getBoundingClientRect().height
          ),
        }));
        expect(geometry.width).toBeLessThanOrEqual(240);
        expect(geometry.overflow).toBe(false);
        expect(geometry.separators.every(height => height <= 1)).toBe(true);
        const signOut = menu.getByRole('menuitem', { name: /Sign out/ });
        await expect(signOut).toBeInViewport();
        const signOutBox = await signOut.boundingBox();
        const diagnosticsBox = await menu
          .getByTestId('app-build-diagnostics')
          .boundingBox();
        expect(signOutBox!.y + signOutBox!.height).toBeLessThanOrEqual(
          diagnosticsBox!.y
        );
        await page.keyboard.press('End');
        await expect(signOut).toBeFocused();
        await page.keyboard.press('Home');
        await expect(profile).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(
          menu.getByRole('menuitem', { name: /^Settings/ })
        ).toBeFocused();
        await capture(
          page,
          `mac-account-${viewportName}-${theme}${state}`,
          testInfo
        );
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(menu).toBeVisible();
        await menu.getByRole('menuitem', { name: 'Help', exact: true }).focus();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
    });
  }
}
