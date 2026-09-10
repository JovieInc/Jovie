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

test.describe('unified composer palette and dictation feedback', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const theme of THEMES) {
    for (const width of [1200, 390]) {
      test(`shared entries and microphone recovery [${theme}, ${width}]`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 760 });
        await page.addInitScript(() => {
          class DeniedRecognition {
            onerror: ((event: { error: string }) => void) | null = null;
            start() {
              queueMicrotask(() => this.onerror?.({ error: 'not-allowed' }));
            }
            stop() {}
            abort() {}
          }
          Object.defineProperty(window, 'SpeechRecognition', {
            configurable: true,
            value: DeniedRecognition,
          });
        });
        await openStory(page, 'jovie-components-chatinput--docked', theme);
        const textarea = page.getByLabel('Chat Message Input');
        const surface = page.getByTestId('chat-composer-surface');
        await expect(textarea).toBeVisible();
        await page.getByRole('button', { name: 'Attachment options' }).click();
        await expect(page.getByRole('listbox')).toBeVisible();
        const plusItems = await page.getByRole('option').allTextContents();
        expect(plusItems[0]).toContain('Attach Files');
        const filter = page.getByLabel('Filter Commands And References');
        await expect(filter).toBeFocused();
        await testInfo.attach(`plus-${theme}-${width}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await filter.fill('audio');
        await expect(
          page.getByRole('option', { name: /Upload audio/ })
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(textarea).toBeFocused();
        await expect(textarea).toHaveValue('');
        await textarea.fill('/');
        await expect(page.getByRole('listbox')).toBeVisible();
        expect(await page.getByRole('option').allTextContents()).toEqual(
          plusItems
        );
        await textarea.fill('/audio');
        await expect(
          page.getByRole('option', { name: /Upload audio/ })
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await textarea.fill('');
        await expect(surface).toHaveCSS('transform', 'none');
        const initial = await surface.boundingBox();
        await page.getByTestId('dictation-toggle').click();
        const alert = page.getByRole('alert');
        await expect(alert).toContainText('Microphone access was denied');
        expect(await surface.boundingBox()).toEqual(initial);
        const alertBox = (await alert.boundingBox())!;
        expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(initial!.y);
        expect(alertBox.x).toBeGreaterThanOrEqual(0);
        expect(alertBox.x + alertBox.width).toBeLessThanOrEqual(width);
        await testInfo.attach(`microphone-error-${theme}-${width}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await page.getByRole('button', { name: 'Dismiss' }).click();
        await expect(alert).not.toBeVisible();
        expect(await surface.boundingBox()).toEqual(initial);
      });
    }
  }
});

test.describe('two opportunity formats near the composer', () => {
  for (const theme of THEMES) {
    for (const width of [1200, 390]) {
      test(`compact suggestions dock and yield to picker [${theme}, ${width}]`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 760 });
        await openStory(
          page,
          'organisms-opportunitycard--above-composer',
          theme
        );
        const suggestion = page.getByRole('button', {
          name: 'Review your release checklist',
        });
        const surface = page.getByTestId('chat-composer-surface');
        await expect(suggestion).toBeVisible();
        const row = (await suggestion.boundingBox())!;
        const composer = (await surface.boundingBox())!;
        expect(row.height).toBeLessThanOrEqual(32);
        expect(composer.y - row.y - row.height).toBeGreaterThanOrEqual(0);
        expect(composer.y - row.y - row.height).toBeLessThanOrEqual(40);
        await page.getByRole('button', { name: 'Attachment options' }).click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await expect(suggestion).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(suggestion).toBeVisible();
        await suggestion.click();
        await expect(page.getByLabel('Chat Message Input')).toHaveValue(
          'Review your release checklist'
        );
      });
    }
    test(`editorial retains full context [${theme}]`, async ({ page }) => {
      await openStory(page, 'organisms-opportunitycard--editorial', theme);
      await expect(page.getByRole('article')).toHaveAttribute(
        'data-opportunity-format',
        'editorial'
      );
      await expect(
        page.getByRole('heading', { name: 'Review your release checklist' })
      ).toBeVisible();
      await expect(
        page.getByText('Check artwork, credits and links before the release.')
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Review Release' })
      ).toBeVisible();
    });
  }
});

test.describe('desktop header shares the traffic-light row', () => {
  for (const width of [1200, 390]) {
    test(`aligned controls and title at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 });
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.dataset.desktopRuntime = 'electron';
        });
      });
      await openStory(
        page,
        'organisms-appshellframe--header-alignment',
        'light'
      );
      const toggle = page.getByTestId('electron-sidebar-toggle');
      const heading = page.getByRole('heading', { name: 'New Chat' });
      await expect(toggle).toBeVisible();
      await expect(heading).toBeVisible();
      const assertGeometry = async () => {
        const title = (await heading.boundingBox())!;
        const control = (await toggle.boundingBox())!;
        expect(
          Math.abs(title.y + title.height / 2 - control.y - control.height / 2)
        ).toBeLessThanOrEqual(2);
        expect(title.x).toBeGreaterThanOrEqual(200);
        expect(
          await heading.evaluate(el => el.scrollWidth <= el.clientWidth)
        ).toBe(true);
        expect(title.x + title.width).toBeLessThanOrEqual(width);
        await expect(page.getByTestId('dashboard-header')).toHaveCSS(
          '-webkit-app-region',
          'drag'
        );
        await expect(toggle).toHaveCSS('-webkit-app-region', 'no-drag');
        await expect(page.getByRole('button', { name: 'Help' })).toHaveCSS(
          '-webkit-app-region',
          'no-drag'
        );
      };
      await assertGeometry();
      if (width > 1024) {
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-label', 'Expand sidebar');
        await expect(page.locator('[data-app-shell-sidebar-mount]')).toHaveCSS(
          'width',
          '0px'
        );
        await assertGeometry();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-label', 'Collapse sidebar');
      }
    });
  }
  test('headerless media routes retain a window-control safe area', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.desktopRuntime = 'electron';
      });
    });
    await openStory(
      page,
      'organisms-appshellframe--route-owned-header',
      'light'
    );
    const control = (await page
      .getByTestId('electron-sidebar-toggle')
      .boundingBox())!;
    const action = (await page
      .getByRole('button', { name: 'Route header action' })
      .boundingBox())!;
    expect(action.y).toBeGreaterThanOrEqual(control.y + control.height);
  });
  for (const width of [1200, 390]) {
    test(`Settings title shares native band at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 760 });
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.dataset.desktopRuntime = 'electron';
        });
      });
      await openStory(
        page,
        'organisms-appshellframe--settings-header-alignment',
        'light'
      );
      const toggle = page.getByTestId('electron-sidebar-toggle');
      const heading = page.getByRole('heading', {
        name: 'Account',
        exact: true,
      });
      await expect(heading).toHaveCount(1);
      const verify = async () => {
        const title = (await heading.boundingBox())!;
        const control = (await toggle.boundingBox())!;
        expect(
          Math.abs(title.y + title.height / 2 - control.y - control.height / 2)
        ).toBeLessThanOrEqual(2);
        expect(title.x).toBeGreaterThanOrEqual(200);
        expect(
          await heading.evaluate(el => el.scrollWidth <= el.clientWidth)
        ).toBe(true);
        await expect(
          page.getByText('Security, theme, and notifications.')
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      };
      await verify();
      if (width > 1024) {
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-label', 'Expand sidebar');
        await verify();
      }
    });
  }
  test('browser retains its normal page header', async ({ page }) => {
    await openStory(page, 'organisms-appshellframe--header-alignment', 'light');
    await expect(page.getByTestId('electron-titlebar-row')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'New Chat' })).toBeVisible();
    await expect(page.getByTestId('dashboard-header')).toHaveCSS(
      '-webkit-app-region',
      'none'
    );
  });
});

test.describe('one sidebar Inbox and notification destination', () => {
  for (const theme of THEMES) {
    test(`brand bell and search share one row [${theme}]`, async ({ page }) => {
      await openStory(page, 'organisms-unifiedsidebar--dashboard', theme);
      const row = page.locator('[data-sidebar-brand-row]');
      const inbox = page.getByRole('link', { name: /Inbox —/ });
      const search = page.getByRole('button', { name: 'Search Jovie' });
      await expect(inbox).toHaveAttribute('href', '/app');
      await expect(search).toHaveCount(1);
      await expect(row).toContainText('Jovie');
      const bellBox = (await inbox.boundingBox())!;
      const searchBox = (await search.boundingBox())!;
      expect(Math.abs(bellBox.y - searchBox.y)).toBeLessThanOrEqual(1);
      expect(searchBox.x).toBeGreaterThan(bellBox.x);
      await expect(
        page.getByRole('link', { name: 'Inbox', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Calendar', exact: true })
      ).toBeVisible();
      await expect(page.locator('[data-sidebar="notifications"]')).toHaveCount(
        0
      );
    });
  }
  test('desktop update stays pending and is actionable in Inbox', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const fixture = window as unknown as {
        available?: () => void;
        downloaded?: () => void;
        installs: number;
        electronAPI: unknown;
      };
      fixture.installs = 0;
      fixture.electronAPI = {
        platform: 'darwin',
        electronVersion: 'fixture',
        onUpdateAvailable: (cb: () => void) => {
          fixture.available = cb;
          return () => {};
        },
        onUpdateDownloaded: (cb: () => void) => {
          fixture.downloaded = cb;
          return () => {};
        },
        installUpdateAndRestart: () => {
          fixture.installs++;
        },
      };
    });
    await openStory(page, 'shell-sidebarinboxbutton--runtime-update', 'light');
    await expect
      .poll(() =>
        page.evaluate(
          () => typeof (window as unknown as { available?: unknown }).available
        )
      )
      .toBe('function');
    await page.evaluate(() =>
      (window as unknown as { available: () => void }).available()
    );
    await expect(
      page.getByRole('button', { name: 'Downloading Jovie Update…' })
    ).toBeDisabled();
    await expect(
      page.getByRole('link', { name: 'Inbox — App Update Available' })
    ).toHaveAttribute('href', '/app');
    await page.evaluate(() =>
      (window as unknown as { downloaded: () => void }).downloaded()
    );
    await expect(
      page.getByRole('button', { name: 'Restart Jovie To Update' })
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => (window as unknown as { installs: number }).installs
      )
    ).toBe(0);
    await page.getByRole('button', { name: 'Restart Jovie To Update' }).click();
    expect(
      await page.evaluate(
        () => (window as unknown as { installs: number }).installs
      )
    ).toBe(1);
  });
});
