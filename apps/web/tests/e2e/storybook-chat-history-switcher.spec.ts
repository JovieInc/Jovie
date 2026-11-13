import { expect, type Page, test } from '@playwright/test';

/**
 * Chat history switcher visual regression.
 *
 * Covers the menu that opens from the chat title in the app header: closed,
 * open on a long list, searching, no matches, empty history, unread dots and
 * the state after it closes, in light and dark. Also checks that the menu
 * animates in and out, and that it doesn't when reduced motion is on.
 *
 * Stories live in `apps/web/components/jovie/ChatHistorySwitcher.stories.tsx`.
 * The menu renders in a portal, so shots are clipped page regions around the
 * trigger and menu rather than the story root.
 */

const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;
const STORY_PREFIX = 'chat-chathistoryswitcher--';
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

// The trigger sits at the story's top-left padding; the menu opens below it.
const MENU_REGION = { x: 0, y: 0, width: 520, height: 560 } as const;
const TRIGGER_REGION = { x: 0, y: 0, width: 360, height: 72 } as const;

async function openStory(page: Page, story: string, theme: Theme) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORYBOOK_THEME_STORAGE_KEY, value: theme }
  );
  const previewErrors: string[] = [];
  page.on('pageerror', error => previewErrors.push(`pageerror: ${error}`));
  await page.goto(`/iframe.html?id=${STORY_PREFIX}${story}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  const root = page.locator('#storybook-root');
  try {
    await expect(root).not.toBeEmpty({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  } catch (error) {
    if (previewErrors.length) {
      throw new Error(
        `Storybook preview did not render ${story}: ${previewErrors.join(' | ')}`,
        { cause: error }
      );
    }
    throw error;
  }
  await expect(page.getByTestId('chat-history-trigger')).toBeVisible();
}

/** Stories with a play function open the menu themselves; wait for it. */
async function waitForMenu(page: Page) {
  const menu = page.locator('[data-slot="common-dropdown-scroll-body"]');
  await expect(menu).toBeVisible();
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map(animation => animation.finished))
  );
  return menu;
}

test.describe('chat history switcher', () => {
  for (const theme of THEMES) {
    test(`closed [${theme}]`, async ({ page }) => {
      await openStory(page, 'closed', theme);
      await expect(page).toHaveScreenshot(`closed-${theme}.png`, {
        clip: TRIGGER_REGION,
      });
    });

    test(`open on a long list [${theme}]`, async ({ page }) => {
      await openStory(page, 'open', theme);
      await waitForMenu(page);
      await expect(page.getByPlaceholder('Chat History')).toBeFocused();
      await expect(page).toHaveScreenshot(`open-${theme}.png`, {
        clip: MENU_REGION,
      });
    });

    test(`searching [${theme}]`, async ({ page }) => {
      await openStory(page, 'open', theme);
      await waitForMenu(page);
      // Typing anywhere in the menu lands in the search field.
      await page.keyboard.type('tour');
      await expect(page.getByPlaceholder('Chat History')).toHaveValue('tour');
      await expect(page.getByRole('menuitem')).toHaveCount(1);
      await expect(page).toHaveScreenshot(`searching-${theme}.png`, {
        clip: MENU_REGION,
      });
    });

    test(`no matches [${theme}]`, async ({ page }) => {
      await openStory(page, 'no-matches', theme);
      const menu = await waitForMenu(page);
      await expect(menu).toContainText('No Matching Chats');
      await expect(page).toHaveScreenshot(`no-matches-${theme}.png`, {
        clip: MENU_REGION,
      });
    });

    test(`empty history [${theme}]`, async ({ page }) => {
      await openStory(page, 'empty-history', theme);
      const menu = await waitForMenu(page);
      await expect(menu).toContainText('No Chats Yet');
      await expect(page).toHaveScreenshot(`empty-${theme}.png`, {
        clip: MENU_REGION,
      });
    });

    test(`unread dots [${theme}]`, async ({ page }) => {
      await openStory(page, 'unread', theme);
      await waitForMenu(page);
      await expect(page).toHaveScreenshot(`unread-${theme}.png`, {
        clip: MENU_REGION,
      });
    });

    test(`after closing [${theme}]`, async ({ page }) => {
      await openStory(page, 'open', theme);
      const menu = await waitForMenu(page);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(page.getByTestId('chat-history-trigger')).toBeFocused();
      await expect(page).toHaveScreenshot(`after-close-${theme}.png`, {
        clip: TRIGGER_REGION,
      });
    });
  }

  test('animates in and out', async ({ page }) => {
    await openStory(page, 'closed', 'dark');
    const trigger = page.getByTestId('chat-history-trigger');
    const content = page.locator('[data-motion="anchored"]');

    await trigger.click();
    await expect(content).toHaveAttribute('data-state', 'open');
    const enter = await content.evaluate(node => node.getAnimations().length);
    expect(enter).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    const exit = await content.evaluate(node =>
      node.getAttribute('data-state') === 'closed'
        ? node.getAnimations().length
        : -1
    );
    expect(exit).toBeGreaterThan(0);
    await expect(content).toBeHidden();
  });

  test('skips the motion with reduced motion on', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openStory(page, 'closed', 'dark');
    await page.getByTestId('chat-history-trigger').click();
    const content = page.locator('[data-motion="anchored"]');
    await expect(content).toHaveAttribute('data-state', 'open');
    expect(await content.evaluate(node => node.getAnimations().length)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
  });
});
