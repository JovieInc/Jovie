import type { Locator, Page } from '@playwright/test';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

type StreamChunk = Record<string, unknown>;

const CHAT_PANEL = '[data-testid="onboarding-chat"]';
const COMPOSER_SURFACE = '[data-testid="chat-composer-surface"]';
const COMPOSER_TEXTAREA = '[aria-label="Chat message input" i]';
const TEST_AVATAR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeElEQVR4nO3PQQ3AIADAQMD+/5w9QnJ4QKZsZu2cJwAAAAAAAAAAAAAAANxq7g7wG7iBHYgb2IG4gR2IG9iBuIEdiBvYgbiBHYgb2IG4gR2IG9iBuIEdiBvYgbiBHYgb2IG4gR2IG9iBuIEdiBvYgbiBHYgb2IG4gR2IG9gB9bYCfQMD+LwAAAAASUVORK5CYII=';
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
    if (msg.type() === 'error') {
      const location = msg.location().url;
      failures.push(location ? `${msg.text()} (${location})` : msg.text());
    }
  });
  page.on('pageerror', error => {
    failures.push(error.message);
  });
  return failures;
}

async function suppressDevToolbar(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('__dev_toolbar_hidden', '1');
  });
}

async function sendComposerMessage(page: Page, text: string) {
  await page.locator(COMPOSER_TEXTAREA).fill(text);
  const sendButton = page.getByRole('button', { name: 'Send message' });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}

function relevantConsoleFailures(failures: readonly string[]) {
  return failures.filter(
    failure => !IGNORABLE_CONSOLE_ERRORS.some(pattern => pattern.test(failure))
  );
}

async function expectFixedElementScreenshot({
  height,
  locator,
  maxDiffPixelRatio,
  name,
  page,
  width,
}: {
  readonly height: number;
  readonly locator: Locator;
  readonly maxDiffPixelRatio: number;
  readonly name: string;
  readonly page: Page;
  readonly width: number;
}) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - height)).toBeLessThanOrEqual(1);
  await expect(page).toHaveScreenshot(name, {
    clip: {
      x: box.x,
      y: box.y,
      width,
      height,
    },
    maxDiffPixelRatio,
  });
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
          imageUrl: 'https://i.scdn.co/image/test-artist',
          followers: 12_300,
          popularity: 48,
        },
      ]),
    });
  });
  await page.route('https://i.scdn.co/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(TEST_AVATAR_PNG_BASE64, 'base64'),
    });
  });
  await page.route('**/_next/image?**', async route => {
    const sourceUrl = new URL(route.request().url()).searchParams.get('url');
    if (sourceUrl?.startsWith('https://i.scdn.co/')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(TEST_AVATAR_PNG_BASE64, 'base64'),
      });
      return;
    }
    await route.continue();
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
            text: "Awesome, let's do it. Pick the exact Spotify artist.",
            toolName: 'searchSpotifyArtist',
            toolCallId: 'tool-search',
            input: { query: 'Test Artist' },
            output: {
              action: 'open_artist_picker',
              query: 'Test Artist',
              summary: 'Pick the exact Spotify artist.',
            },
          })
        : textAndToolStream({
            messageId: 'assistant-confirm',
            text: 'Pulled you up. 12.3K Spotify followers and enough signal to treat the release setup seriously. The gap is the downstream layer, not the songs.',
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
                imageUrl: 'https://i.scdn.co/image/test-artist',
                followers: 12_300,
                popularity: 48,
                genres: ['progressive house'],
                dspMatches: [
                  {
                    id: 'apple-music',
                    label: 'Apple Music',
                    platform: 'applemusic',
                    url: 'https://music.apple.com/us/artist/test-artist',
                  },
                ],
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
  test.setTimeout(360_000);

  test.beforeEach(async ({ page }) => {
    page.setDefaultNavigationTimeout(240_000);
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
    await expect(page.getByTestId('chat-empty-state-logo')).toBeVisible();
    await expect(
      page.getByTestId('chat-empty-state-centered-composer')
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-empty-intro')).toBeVisible();
    await expect(
      page.getByTestId('onboarding-starter-suggestions')
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-sign-in-skip')).toBeVisible();
    await expect(
      page.getByText(/remember this chat so we can pick up where we left off/i)
    ).toBeVisible();
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

  test('narrow screen keeps the empty chat and feedback slash command usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 615, height: 407 });
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.getByTestId('chat-empty-state-logo')).toBeVisible();

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await textarea.fill('/feed');
    await expect(
      page.locator('[data-testid="slash-command-menu"]')
    ).toBeVisible();
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

  test('homepage starter prompt auto-submits into a conversation', async ({
    page,
  }) => {
    const getChatRequestCount = await mockOnboardingChat(page);
    const prompt = 'Hey, I want to get access to Jovie.';

    await page.goto(`/start?starter_prompt=${encodeURIComponent(prompt)}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForHydration(page);

    await expect(page.getByText(prompt)).toBeVisible();
    await expect(
      page.getByText('Pick the exact Spotify artist').first()
    ).toBeVisible();
    await expect(page.getByTestId('onboarding-artist-picker')).toBeVisible();
    await expect(page.locator(COMPOSER_TEXTAREA)).toHaveValue('');
    expect(getChatRequestCount()).toBe(1);
  });

  test('submitted user turn stays compact and clear of the composer on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockOnboardingChat(page);
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await sendComposerMessage(page, 'yes music artist and writer');

    const bubble = page.getByTestId('chat-user-bubble').first();
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('.system-b-chat-user-text')).toHaveCSS(
      'font-size',
      '13px'
    );
    await expect(bubble).toHaveCSS('padding-top', '6px');
    await expect(bubble).toHaveCSS('padding-right', '12px');
    await expect(bubble).toHaveCSS('padding-bottom', '6px');
    await expect(bubble).toHaveCSS('padding-left', '12px');

    const bubbleBox = await bubble.boundingBox();
    const composerBox = await page.locator(COMPOSER_SURFACE).boundingBox();
    expect(bubbleBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    if (bubbleBox && composerBox) {
      expect(bubbleBox.height).toBeLessThanOrEqual(40);
      expect(bubbleBox.y + bubbleBox.height).toBeLessThan(composerBox.y);
    }

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('onboarding-profile-rail')).toBeHidden();
    await expect(
      page.getByTestId('onboarding-profile-rail-inline')
    ).toHaveCount(0);
  });

  test('selected artist preview stays inline on mobile without overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockOnboardingChat(page);
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await sendComposerMessage(page, 'I am Test Artist');

    await expect(page.getByTestId('onboarding-artist-picker')).toBeVisible();
    await page.getByTestId('onboarding-artist-picker').getByText('Use').click();

    await expect(page.getByTestId('onboarding-profile-rail')).toBeHidden();
    const inlineRail = page.getByTestId('onboarding-profile-rail-inline');
    await expect(inlineRail).toBeVisible();
    await expect(
      inlineRail.getByTestId('onboarding-profile-bento')
    ).toBeVisible();
    await expect(
      inlineRail.getByTestId('onboarding-phone-preview')
    ).toBeVisible();
    await expect(
      inlineRail.getByTestId('onboarding-profile-compact-surface')
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const screenshotPath =
      'test-results/onboarding-demo-mobile-rail-layout.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('onboarding-demo-mobile-rail-layout', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('auth error and slash picker do not collide at narrow desktop size', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 615, height: 407 });
    await mockOnboardingChatFailure(page);
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const textarea = page.locator(COMPOSER_TEXTAREA);
    await sendComposerMessage(page, 'Test Artist');

    const alert = page.getByRole('alert').filter({ hasText: 'Message paused' });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(
      'Authentication service is initializing'
    );

    await textarea.fill('/');
    const slashMenu = page.locator('[data-testid="slash-command-menu"]');
    await expect(slashMenu).toBeVisible();
    await expect(alert).toBeVisible();

    await expect
      .poll(async () => {
        const alertBox = await alert.boundingBox();
        const slashMenuBox = await slashMenu.boundingBox();
        if (!(alertBox && slashMenuBox)) return true;
        return (
          alertBox.x < slashMenuBox.x + slashMenuBox.width &&
          alertBox.x + alertBox.width > slashMenuBox.x &&
          alertBox.y < slashMenuBox.y + slashMenuBox.height &&
          alertBox.y + alertBox.height > slashMenuBox.y
        );
      })
      .toBe(false);

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
    const yBefore =
      (await page.locator(COMPOSER_SURFACE).boundingBox())?.y ?? 0;
    await page.getByRole('button', { name: 'Send message' }).click();
    await firstChatResponse;
    const yAfter = (await page.locator(COMPOSER_SURFACE).boundingBox())?.y ?? 0;
    expect(Math.abs(yAfter - yBefore)).toBeLessThanOrEqual(5); // Addresses journey jank audit 20260519 + testing.md explicit CLS requirement for conditional UI (composer morph, row replace, cinematic fallback)

    await expect(
      page.getByText('Pick the exact Spotify artist').first()
    ).toBeVisible();
    await expectFixedElementScreenshot({
      height: 168,
      locator: page.getByTestId('onboarding-artist-picker'),
      maxDiffPixelRatio: 0.05,
      name: 'start-artist-picker.png',
      page,
      width: 440,
    });

    await page.getByTestId('onboarding-artist-picker').getByText('Use').click();

    await expect(page.getByTestId('onboarding-artist-confirmed')).toHaveCount(
      0
    );
    const sideRail = page.getByTestId('onboarding-profile-rail');
    await expect(sideRail).toBeVisible();
    await expect(
      sideRail.getByTestId('onboarding-profile-bento')
    ).toBeVisible();
    await expect(
      sideRail.getByTestId('onboarding-profile-compact-surface')
    ).toBeVisible();
    await expect(
      sideRail.getByTestId('onboarding-phone-preview')
    ).toBeVisible();
    const sideRailText = await sideRail.innerText();
    expect(sideRailText.match(/\bTest Artist\b/g) ?? []).toHaveLength(1);
    await expect(sideRail.getByTitle('Apple Music').first()).toBeVisible();
    await expect(
      sideRail.getByText('12.3K Spotify followers').first()
    ).toBeVisible();
    await expect(
      page.getByText('Pulled you up. 12.3K Spotify followers')
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
