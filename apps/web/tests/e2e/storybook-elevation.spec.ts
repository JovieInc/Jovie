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
    id: 'design-system-elevation-matrix--banned-surface1-on-surface1-no-border',
    name: 'banned-surface1-on-surface1-no-border',
  },
  {
    id: 'design-system-elevation-matrix--banned-surface1-translucent',
    name: 'banned-surface1-translucent',
  },
  {
    id: 'design-system-elevation-matrix--banned-card-stripped-elevation',
    name: 'banned-card-stripped-elevation',
  },
  {
    id: 'design-system-elevation-matrix--banned-surface0-translucent',
    name: 'banned-surface0-translucent',
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
    waitUntil: 'networkidle',
  });
  const root = page.locator('#storybook-root');
  await expect(root).toBeVisible();
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
      'design-system-elevation-matrix--banned-surface1-on-surface1-no-border',
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
