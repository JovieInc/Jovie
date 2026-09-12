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

// The existing elevation lane exercises the actual theme CSS and portaled
// overlays; jsdom cannot prove contrast or sidebar geometry.
test.describe('sidebar account and tooltip regressions', () => {
  for (const theme of THEMES) {
    test(`tooltip contrast [${theme}]`, async ({ page }, testInfo) => {
      await openStory(page, 'ui-atoms-tooltip--sidebar-long-title', theme);
      const tooltip = page.getByTestId('tooltip-content');
      await expect(tooltip).toBeVisible();
      const contrast = await tooltip.evaluate(element => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map(value => {
              const channel = value / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const fg = luminance(style.color);
        const bg = luminance(style.backgroundColor);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await testInfo.attach(`tooltip-${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    });

    for (const state of ['expanded', 'narrow', 'collapsed']) {
      test(`compact account ${state} [${theme}]`, async ({
        page,
      }, testInfo) => {
        await openStory(
          page,
          `organisms-sidebaridentitygroup--${state}`,
          theme
        );
        const panel = page.getByTestId('sidebar-user-panel');
        const account = panel.getByRole('button');
        const profile = panel.getByRole('link', {
          name: 'Public Profile jov.ie/timwhite',
        });
        await expect(account).toBeVisible();
        await expect(profile).toHaveAttribute('href', '/timwhite');
        const initial = (await panel.boundingBox())!;
        const accountBox = (await account.boundingBox())!;
        const profileBox = (await profile.boundingBox())!;
        if (state !== 'collapsed') {
          expect(
            Math.abs(
              accountBox.y +
                accountBox.height / 2 -
                profileBox.y -
                profileBox.height / 2
            )
          ).toBeLessThan(1);
          expect(initial.height).toBeLessThanOrEqual(52);
        }
        expect(profileBox.x).toBeGreaterThanOrEqual(initial.x);
        expect(profileBox.x + profileBox.width).toBeLessThanOrEqual(
          initial.x + initial.width
        );
        await account.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menu')).toBeVisible();
        await expect(
          page.getByRole('menuitem', { name: /Settings/ }).first()
        ).toBeVisible();
        expect(await panel.boundingBox()).toEqual(initial);
        await page.keyboard.press('Escape');
        await expect(account).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(profile).toBeFocused();
        await expect(page.getByRole('tooltip')).toContainText(
          'jov.ie/timwhite'
        );
        expect(await panel.boundingBox()).toEqual(initial);
        await page.keyboard.press('Escape');
        await testInfo.attach(`account-${state}-${theme}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      });
    }
  }
});
