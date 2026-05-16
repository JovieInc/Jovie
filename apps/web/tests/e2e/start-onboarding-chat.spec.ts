import type { Page } from '@playwright/test';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

type StreamChunk = Record<string, unknown>;

const CHAT_PANEL = '[data-testid="onboarding-chat"]';
const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat message input"]';
const IGNORABLE_CONSOLE_ERRORS = [
  /favicon/i,
  /ResizeObserver loop/i,
  /eval\(\) is not supported.*React requires eval/i,
] as const;

declare global {
  interface Window {
    __jovieE2eLayoutShift?: number;
  }
}

async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    window.__jovieE2eLayoutShift = 0;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!layoutShift.hadRecentInput) {
            window.__jovieE2eLayoutShift =
              (window.__jovieE2eLayoutShift ?? 0) + (layoutShift.value ?? 0);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      window.__jovieE2eLayoutShift = 0;
    }
  });
}

async function readLayoutShift(page: Page): Promise<number> {
  return page.evaluate(() => window.__jovieE2eLayoutShift ?? 0);
}

function collectConsoleFailures(page: Page) {
  const failures: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') failures.push(msg.text());
  });
  page.on('pageerror', error => {
    failures.push(error.message);
  });
  return failures;
}

async function suppressDevToolbar(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('__dev_toolbar_hidden', '1');

    const resetToolbarHeight = () => {
      document.documentElement?.style.setProperty(
        '--dev-toolbar-height',
        '0px'
      );
    };

    resetToolbarHeight();

    const hideToolbar = () => {
      resetToolbarHeight();
      if (
        !document.head ||
        document.getElementById('jovie-e2e-hide-dev-toolbar')
      ) {
        return;
      }
      const style = document.createElement('style');
      style.id = 'jovie-e2e-hide-dev-toolbar';
      style.textContent = '[data-testid="dev-toolbar"]{display:none!important}';
      document.head.appendChild(style);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hideToolbar, {
        once: true,
      });
    } else {
      hideToolbar();
    }
  });
}

function relevantConsoleFailures(failures: readonly string[]) {
  return failures.filter(
    failure => !IGNORABLE_CONSOLE_ERRORS.some(pattern => pattern.test(failure))
  );
}

function uiStreamBody(chunks: readonly StreamChunk[]) {
  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

function textAndToolStream({
  messageId,
  text,
  toolName,
  toolCallId,
  input,
  output,
}: {
  readonly messageId: string;
  readonly text: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
}) {
  return uiStreamBody([
    { type: 'start', messageId },
    { type: 'start-step' },
    { type: 'text-start', id: `${messageId}-text` },
    { type: 'text-delta', id: `${messageId}-text`, delta: text },
    { type: 'text-end', id: `${messageId}-text` },
    {
      type: 'tool-input-available',
      toolName,
      toolCallId,
      input,
    },
    {
      type: 'tool-output-available',
      toolCallId,
      output,
    },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ]);
}

async function mockOnboardingChat(page: import('@playwright/test').Page) {
  let chatRequestCount = 0;

  await page.route('**/api/spotify/search**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'artist-1',
          name: 'Test Artist',
          url: 'https://open.spotify.com/artist/artist-1',
          imageUrl: null,
          followers: 12_300,
          popularity: 48,
        },
      ]),
    });
  });

  await page.route('**/api/chat', async route => {
    chatRequestCount += 1;
    const body = route.request().postDataJSON() as {
      readonly mode?: string;
      readonly messages?: unknown[];
    };
    expect(body.mode).toBe('onboarding');
    expect(Array.isArray(body.messages)).toBe(true);

    const stream =
      chatRequestCount === 1
        ? textAndToolStream({
            messageId: 'assistant-search',
            text: "heads up, I'll remember this so we can pick up where we left off when you sign up. let's find the exact Spotify profile.",
            toolName: 'searchSpotifyArtist',
            toolCallId: 'tool-search',
            input: { query: 'Test Artist' },
            output: {
              action: 'open_artist_picker',
              query: 'Test Artist',
              summary: 'Pick the matching Spotify artist.',
            },
          })
        : textAndToolStream({
            messageId: 'assistant-confirm',
            text: 'pulled you up. 12.3K Spotify followers and enough signal to treat the release setup seriously. the gap is the downstream layer, not the songs.',
            toolName: 'confirmSpotifyArtist',
            toolCallId: 'tool-confirm',
            input: { spotifyArtistId: 'artist-1' },
            output: {
              action: 'spotify_artist_confirmed',
              spotifyArtistId: 'artist-1',
              artist: {
                id: 'artist-1',
                name: 'Test Artist',
                url: 'https://open.spotify.com/artist/artist-1',
                imageUrl: null,
                followers: 12_300,
                popularity: 48,
                genres: ['progressive house'],
              },
              summary: 'Test Artist matched on Spotify.',
            },
          });

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'set-cookie':
          'jovie_onboarding_session=e2e-session; Path=/; HttpOnly; SameSite=Lax',
      },
      body: stream,
    });
  });

  return () => chatRequestCount;
}

async function mockOnboardingChatFailure(
  page: import('@playwright/test').Page
) {
  await page.route('**/api/chat', async route => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Authentication service is initializing. Please try again.',
      }),
    });
  });
}

test.describe('canonical /start onboarding chat', () => {
  test.beforeEach(async ({ page }) => {
    await suppressDevToolbar(page);
  });

  test('redirect shims land on /start without loops', async ({ page }) => {
    const navigations: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    await page.goto('/onboarding?resume=spotify', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/start\?resume=spotify$/);
    await expect(page.locator(CHAT_PANEL)).toBeVisible();
    expect(navigations.length).toBeLessThanOrEqual(3);

    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/start(?:\?|$)/);
  });

  test('first screen and root picker are visually stable', async ({ page }) => {
    const consoleFailures = collectConsoleFailures(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await installLayoutShiftObserver(page);
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(
      page.locator(
        '[data-app-shell-frame="true"][data-shell-design="shellChatV1"]'
      )
    ).toBeVisible();
    await expect(page.locator(CHAT_PANEL)).toBeVisible();
    await expect(page.getByText("Hey, I'm Jovie.")).toBeVisible();
    const mainBox = await page.locator('#main-content').boundingBox();
    const chatBox = await page.locator(CHAT_PANEL).boundingBox();
    expect(mainBox).not.toBeNull();
    expect(chatBox).not.toBeNull();
    if (mainBox && chatBox) {
      expect(chatBox.width).toBeGreaterThan(1100);
      expect(Math.abs(chatBox.width - mainBox.width)).toBeLessThanOrEqual(2);
    }
    await expect(page).toHaveScreenshot('start-app-shell-initial.png', {
      maxDiffPixelRatio: 0.04,
    });
    expect(await readLayoutShift(page)).toBeLessThanOrEqual(0.02);

    const surface = page.locator(COMPOSER_SURFACE);
    const before = await surface.boundingBox();
    const layoutShiftBeforePicker = await readLayoutShift(page);
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.fill('/');
    await expect(surface).toHaveAttribute('data-surface-mode', 'root');
    await expect(
      page.locator('[data-testid="slash-command-menu"]')
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: /send feedback/i })
    ).toBeVisible();
    const after = await surface.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    }
    expect(await readLayoutShift(page)).toBeLessThanOrEqual(
      layoutShiftBeforePicker + 0.001
    );
    expect(
      relevantConsoleFailures(consoleFailures),
      `Unexpected /start console failures: ${consoleFailures.join('\n')}`
    ).toEqual([]);
  });

  test('narrow screen keeps the intro and feedback slash command usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 615, height: 407 });
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByText("Hey, I'm Jovie.")).toBeVisible();

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.fill('/feed');
    await expect(
      page.locator('[data-testid="slash-command-menu"]')
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-intro-message')).toHaveCSS(
      'opacity',
      '0'
    );
    await expect(
      page.getByRole('option', { name: /send feedback/i })
    ).toBeVisible();

    await expect(page).toHaveScreenshot('start-empty-picker-narrow.png', {
      maxDiffPixelRatio: 0.04,
    });

    await page.getByRole('option', { name: /send feedback/i }).click();
    await expect(page.getByTestId('chat-input-chip-tray')).toContainText(
      'Send feedback'
    );
    await expect(
      page.getByRole('button', { name: 'Send message' })
    ).toBeEnabled();
  });

  test('auth error and slash picker do not collide at narrow desktop size', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 615, height: 407 });
    await mockOnboardingChatFailure(page);
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.fill('Test Artist');
    await page.getByRole('button', { name: 'Send message' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Message paused' });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(
      'Authentication service is initializing'
    );

    await textarea.fill('/');
    const slashMenu = page.locator('[data-testid="slash-command-menu"]');
    await expect(slashMenu).toBeVisible();
    await expect(alert).toBeVisible();

    const alertBox = await alert.boundingBox();
    const slashMenuBox = await slashMenu.boundingBox();
    expect(alertBox).not.toBeNull();
    expect(slashMenuBox).not.toBeNull();
    if (alertBox && slashMenuBox) {
      const overlaps =
        alertBox.x < slashMenuBox.x + slashMenuBox.width &&
        alertBox.x + alertBox.width > slashMenuBox.x &&
        alertBox.y < slashMenuBox.y + slashMenuBox.height &&
        alertBox.y + alertBox.height > slashMenuBox.y;
      expect(overlaps).toBe(false);
    }

    await expect(page).toHaveScreenshot('start-error-picker.png', {
      maxDiffPixelRatio: 0.04,
    });
  });

  test('artist picker flow preserves message continuity and hides tool internals', async ({
    page,
  }) => {
    const consoleFailures = collectConsoleFailures(page);
    const getChatRequestCount = await mockOnboardingChat(page);

    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    const textarea = page.locator(COMPOSER_TEXTAREA);
    await expect(textarea).toBeVisible();
    await textarea.fill('I am Test Artist');
    await expect(
      page.getByRole('button', { name: 'Send message' })
    ).toBeEnabled();

    const firstChatResponse = page.waitForResponse('**/api/chat');
    await page.getByRole('button', { name: 'Send message' }).click();
    await firstChatResponse;

    await expect(
      page.getByText('find the exact Spotify profile')
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-artist-picker')).toBeVisible();
    await expect(page.getByTestId('onboarding-artist-picker')).toHaveScreenshot(
      'start-artist-picker.png',
      { maxDiffPixelRatio: 0.05 }
    );

    await page.getByTestId('onboarding-artist-picker').getByText('Use').click();

    await expect(page.getByTestId('onboarding-artist-confirmed')).toBeVisible();
    await expect(
      page.getByTestId('onboarding-artist-confirmed').getByText('Test Artist')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('onboarding-artist-confirmed')
        .getByTitle('12,300 Spotify followers')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('onboarding-artist-confirmed')
        .getByTitle('Popularity score: 48 out of 100')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('onboarding-artist-confirmed')
        .getByText('Progressive House', { exact: true })
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-profile-rail')).toHaveCount(0);
    await expect(
      page.getByTestId('onboarding-profile-rail-inline')
    ).toHaveCount(0);
    await expect(
      page.getByText('find the exact Spotify profile')
    ).toBeVisible();
    await expect(
      page.getByText('pulled you up. 12.3K Spotify followers')
    ).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('searchSpotifyArtist');
    expect(bodyText).not.toContain('confirmSpotifyArtist');
    expect(bodyText).not.toContain('recordInterviewSignal');
    expect(bodyText).not.toContain('open.spotify.com');
    expect(getChatRequestCount()).toBe(2);

    const cookies = await page.context().cookies();
    expect(
      cookies.some(cookie => cookie.name === 'jovie_onboarding_session')
    ).toBe(true);
    expect(
      relevantConsoleFailures(consoleFailures),
      `Unexpected /start console failures: ${consoleFailures.join('\n')}`
    ).toEqual([]);
  });
});
