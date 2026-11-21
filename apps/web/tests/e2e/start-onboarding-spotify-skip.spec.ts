import { join } from 'node:path';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const COMPOSER_TEXTAREA = '[aria-label="Chat message input" i]';
const TEST_AVATAR_PNG_PATH = join(
  __dirname,
  '../../public/avatars/default-user.png'
);

function uiStreamBody(chunks: readonly Record<string, unknown>[]) {
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
    { type: 'tool-input-available', toolName, toolCallId, input },
    { type: 'tool-output-available', toolCallId, output },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ]);
}

async function sendComposerMessage(page: import('@playwright/test').Page, text: string) {
  await page.locator(COMPOSER_TEXTAREA).fill(text);
  const sendButton = page.getByRole('button', { name: 'Send message' });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}

test.describe('canonical /start Spotify skip (JOV-14240)', () => {
  test('None of These skips Spotify and advances to the handle step', async ({
    page,
  }) => {
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
        path: TEST_AVATAR_PNG_PATH,
      });
    });
    await page.route('**/api/handle/check**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true, handle: 'testartist' }),
      });
    });
    await page.route('**/api/chat', async route => {
      chatRequestCount += 1;
      const stream =
        chatRequestCount === 1
          ? textAndToolStream({
              messageId: 'assistant-search',
              text: 'Pick the exact Spotify artist.',
              toolName: 'searchSpotifyArtist',
              toolCallId: 'tool-search',
              input: { query: 'Test Artist' },
              output: {
                action: 'open_artist_picker',
                query: 'Test Artist',
                summary: 'Pick the exact Spotify artist.',
              },
            })
          : uiStreamBody([
              { type: 'start', messageId: 'assistant-skip' },
              { type: 'start-step' },
              { type: 'text-start', id: 'assistant-skip-text' },
              {
                type: 'text-delta',
                id: 'assistant-skip-text',
                delta:
                  '@testartist is ready from the match. Keep it, or Change Handle.',
              },
              { type: 'text-end', id: 'assistant-skip-text' },
              {
                type: 'tool-input-available',
                toolName: 'searchSpotifyArtist',
                toolCallId: 'tool-skip',
                input: { query: 'Test Artist' },
              },
              {
                type: 'tool-output-available',
                toolCallId: 'tool-skip',
                output: {
                  action: 'spotify_skipped',
                  query: 'Test Artist',
                  summary: 'Skipped Spotify match.',
                },
              },
              {
                type: 'tool-input-available',
                toolName: 'checkHandle',
                toolCallId: 'tool-handle',
                input: { handle: 'testartist' },
              },
              {
                type: 'tool-output-available',
                toolCallId: 'tool-handle',
                output: {
                  action: 'check_handle',
                  handle: 'testartist',
                  summary: 'Checking @testartist.',
                },
              },
              { type: 'finish-step' },
              { type: 'finish', finishReason: 'stop' },
            ]);
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
        body: stream,
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await sendComposerMessage(page, 'I am Test Artist');
    const picker = page.getByTestId('onboarding-artist-picker');
    await expect(picker).toBeVisible();

    await picker.getByTestId('onboarding-artist-not-me').click();
    await expect(
      page.getByTestId('onboarding-artist-none-of-these')
    ).toBeVisible();

    const skipResponse = page.waitForResponse('**/api/chat');
    await page.getByTestId('onboarding-artist-none-of-these').click();
    await skipResponse;

    await expect(page.getByTestId('onboarding-artist-picker')).toHaveCount(0);
    await expect(page.getByTestId('onboarding-edit-handle')).toBeVisible();
    expect(chatRequestCount).toBe(2);
  });
});
