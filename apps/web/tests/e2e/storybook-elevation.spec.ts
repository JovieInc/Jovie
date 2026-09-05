import { expect, test } from '@playwright/test';

/**
 * Surface-elevation matrix visual regression (JOV-2156).
 *
 * Snapshots every story in `apps/web/.storybook/stories/elevation-matrix.stories.tsx`
 * (allowed + banned nesting combinations from `.claude/rules/ui.md`
 * "Surface Elevation Rules") in both light and dark mode.
 *
 * Theme switching: the Storybook preview wraps stories in a next-themes
 * provider (`attribute="class"`, storageKey `jovie-theme-storybook`,
 * `enableSystem: false`), so the theme is driven by localStorage, not
 * `prefers-color-scheme`.
 */

const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;

const STORIES = [
  // Allowed patterns
  {
    id: 'design-system-elevation-matrix--card-on-shell-canvas',
    name: 'card-on-shell-canvas',
  },
  {
    id: 'design-system-elevation-matrix--well-on-shell-canvas',
    name: 'well-on-shell-canvas',
  },
  {
    id: 'design-system-elevation-matrix--well-inside-card',
    name: 'well-inside-card',
  },
  {
    id: 'design-system-elevation-matrix--drawer-card-on-shell',
    name: 'drawer-card-on-shell',
  },
  {
    id: 'design-system-elevation-matrix--flat-drawer-card-inside-card',
    name: 'flat-drawer-card-inside-card',
  },
  {
    id: 'design-system-elevation-matrix--flat-drawer-card-inside-drawer-card',
    name: 'flat-drawer-card-inside-drawer-card',
  },
  {
    id: 'design-system-elevation-matrix--content-container-on-shell',
    name: 'content-container-on-shell',
  },
  {
    id: 'design-system-elevation-matrix--entity-sidebar-shell-default',
    name: 'entity-sidebar-shell-default',
  },
  // Banned patterns — baselines are the explicit "this should look BROKEN"
  // sanity check; a diff here means someone changed how broken it looks.
  {
    id: 'design-system-elevation-matrix--banned-card-inside-card',
    name: 'banned-card-inside-card',
  },
  {
    id: 'design-system-elevation-matrix--banned-drawer-card-inside-card',
    name: 'banned-drawer-card-inside-card',
  },
  {
    id: 'design-system-elevation-matrix--banned-surface-1-on-surface-1-no-border',
    name: 'banned-surface-1-on-surface-1-no-border',
  },
  {
    id: 'design-system-elevation-matrix--banned-surface-1-translucent',
    name: 'banned-surface-1-translucent',
  },
  {
    id: 'design-system-elevation-matrix--banned-card-stripped-elevation',
    name: 'banned-card-stripped-elevation',
  },
  {
    id: 'design-system-elevation-matrix--banned-surface-0-translucent',
    name: 'banned-surface-0-translucent',
  },
  {
    id: 'design-system-elevation-matrix--banned-content-surface-card',
    name: 'banned-content-surface-card',
  },
] as const;

const THEMES = ['light', 'dark'] as const;

async function openStory(
  page: import('@playwright/test').Page,
  storyId: string,
  theme: (typeof THEMES)[number]
) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORYBOOK_THEME_STORAGE_KEY, value: theme }
  );
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  const root = page.locator('#storybook-root');
  await expect(root).toBeVisible({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  await expect(root).not.toBeEmpty({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  return root;
}

test.describe('surface elevation matrix', () => {
  for (const story of STORIES) {
    for (const theme of THEMES) {
      test(`${story.name} [${theme}]`, async ({ page }) => {
        const root = await openStory(page, story.id, theme);
        await expect(root).toHaveScreenshot(`${story.name}-${theme}.png`);
      });
    }
  }

  // "Should look BROKEN" sanity check: the flagship invisible-card bug must
  // actually be invisible in the banned story. If a token change makes the
  // child distinguishable, the banned baseline no longer documents the bug —
  // fail loudly so the story + baselines get re-reviewed.
  test('banned surface-1-on-surface-1 is genuinely invisible (light)', async ({
    page,
  }) => {
    await openStory(
      page,
      'design-system-elevation-matrix--banned-surface-1-on-surface-1-no-border',
      'light'
    );
    const parent = page.getByTestId('surface-parent');
    const child = page.getByTestId('surface-child');
    await expect(parent).toBeVisible();

    const parentBg = await parent.evaluate(
      el => getComputedStyle(el).backgroundColor
    );
    const childStyles = await child.evaluate(el => {
      const styles = getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        borderTopWidth: styles.borderTopWidth,
        boxShadow: styles.boxShadow,
      };
    });

    expect(childStyles.backgroundColor).toBe(parentBg);
    expect(childStyles.borderTopWidth).toBe('0px');
    expect(childStyles.boxShadow).toBe('none');
  });

  // Positive invariant: an elevated Card on the shell canvas must keep its
  // border + shadow. Functional backstop for the screenshot (gotcha class #8
  // is a card silently losing elevation).
  test('card on shell canvas keeps border and shadow (light)', async ({
    page,
  }) => {
    await openStory(
      page,
      'design-system-elevation-matrix--card-on-shell-canvas',
      'light'
    );
    const card = page.getByTestId('elevation-card');
    await expect(card).toBeVisible();

    const styles = await card.evaluate(el => {
      const computed = getComputedStyle(el);
      return {
        borderTopWidth: computed.borderTopWidth,
        boxShadow: computed.boxShadow,
      };
    });

    expect(styles.borderTopWidth).toBe('1px');
    expect(styles.boxShadow).not.toBe('none');
  });
});

test.describe('desktop shell optical grid', () => {
  for (const theme of THEMES) {
    for (const width of [900, 1224]) {
      test(`${theme} ${width}px keeps native controls on one row`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 800 });
        await page.addInitScript(() =>
          Object.defineProperty(window, 'electronAPI', {
            configurable: true,
            value: {},
          })
        );
        await openStory(
          page,
          'organisms-appshellframe--desktop-navigation',
          theme
        );
        await page.evaluate(
          () => (document.documentElement.dataset.desktopRuntime = 'electron')
        );
        const toggle = page.getByTestId('electron-sidebar-toggle');
        await expect(page.getByTestId('electron-release-identity')).toHaveCount(
          0
        );

        const control = page.getByTestId('electron-nav-forward');
        const header = page.getByTestId('dashboard-header');
        const main = page.locator('#main-content');
        const controlBox = (await control.boundingBox())!;
        const headerBox = (await header.boundingBox())!;
        const mainBox = (await main.boundingBox())!;
        expect(mainBox.y).toBeLessThan(8);
        const centerY = (box: { y: number; height: number }) =>
          box.y + box.height / 2;
        expect(Math.abs(centerY(controlBox) - 23)).toBeLessThanOrEqual(1);
        expect(Math.abs(centerY(headerBox) - 23)).toBeLessThanOrEqual(1);

        if (width >= 1024) {
          const link = page.getByRole('link', { name: 'New Chat' });
          await expect(link).toBeVisible();
          const label = link.locator('span');
          expect(
            await label.evaluate(
              element =>
                element.scrollWidth <= element.clientWidth &&
                getComputedStyle(element).maskImage === 'none'
            )
          ).toBe(true);
          const before = await link.boundingBox();
          await link.hover();
          await link.focus();
          await expect(link).toBeFocused();
          expect(await link.boundingBox()).toEqual(before);
          await toggle.click();
          await expect(
            page.getByRole('button', { name: 'Expand sidebar' })
          ).toBeVisible();
          expect((await main.boundingBox())!.y).toBe(mainBox.y);
        }

        await testInfo.attach('desktop-shell-optical-grid', {
          body: await page.screenshot(),
        });
      });
    }
  }
});
