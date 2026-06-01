import type { Page } from '@playwright/test';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
  trace: 'on',
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});

type StreamChunk = Record<string, unknown>;

const DAVID_GUETTA_ARTIST = {
  id: '3pdSqTHnTx6tCEpR50zgc4',
  name: 'David Guetta',
  url: 'https://open.spotify.com/artist/3pdSqTHnTx6tCEpR50zgc4',
  imageUrl: null,
  followers: 28_000_000,
  popularity: null,
  genres: ['dance pop', 'edm'],
} as const;

const COMPOSER_TEXTAREA = '[aria-label="Chat message input"]';

function uiStreamBody(chunks: readonly StreamChunk[]) {
  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

function textAndToolsStream({
  messageId,
  text,
  tools,
}: {
  readonly messageId: string;
  readonly text: string;
  readonly tools: readonly {
    readonly input: Record<string, unknown>;
    readonly output: Record<string, unknown>;
    readonly toolCallId: string;
    readonly toolName: string;
  }[];
}) {
  return uiStreamBody([
    { type: 'start', messageId },
    { type: 'start-step' },
    { type: 'text-start', id: `${messageId}-text` },
    { type: 'text-delta', id: `${messageId}-text`, delta: text },
    { type: 'text-end', id: `${messageId}-text` },
    ...tools.flatMap(tool => [
      {
        type: 'tool-input-available',
        toolName: tool.toolName,
        toolCallId: tool.toolCallId,
        input: tool.input,
      },
      {
        type: 'tool-output-available',
        toolCallId: tool.toolCallId,
        output: tool.output,
      },
    ]),
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ]);
}

async function suppressDevToolbar(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('__dev_toolbar_hidden', '1');
    document.documentElement?.style.setProperty('--dev-toolbar-height', '0px');
  });
}

async function mockDavidGuettaOnboarding(page: Page) {
  let chatRequestCount = 0;

  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/handle/check**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true, handle: 'davidguetta' }),
    })
  );
  await page.route('**/api/spotify/search**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([DAVID_GUETTA_ARTIST]),
    })
  );

  await page.route('**/api/chat', async route => {
    chatRequestCount += 1;
    const body = route.request().postDataJSON() as {
      readonly messages?: unknown[];
      readonly mode?: string;
    };
    expect(body.mode).toBe('onboarding');
    expect(Array.isArray(body.messages)).toBe(true);

    const stream =
      chatRequestCount === 1
        ? textAndToolsStream({
            messageId: 'assistant-david-search',
            text: "yes. I'll verify the Spotify artist first, then build the profile from supported data.",
            tools: [
              {
                toolName: 'searchSpotifyArtist',
                toolCallId: 'tool-david-search',
                input: { query: 'David Guetta' },
                output: {
                  action: 'open_artist_picker',
                  query: 'David Guetta',
                  summary: 'Pick the matching Spotify artist.',
                },
              },
            ],
          })
        : chatRequestCount === 2
          ? textAndToolsStream({
              messageId: 'assistant-david-confirm',
              text: 'pulled you up. Spotify shows 28M followers, so the access decision is easy; the sharper question is what this profile needs to convert right now.',
              tools: [
                {
                  toolName: 'confirmSpotifyArtist',
                  toolCallId: 'tool-david-confirm',
                  input: { spotifyArtistId: DAVID_GUETTA_ARTIST.id },
                  output: {
                    action: 'spotify_artist_confirmed',
                    spotifyArtistId: DAVID_GUETTA_ARTIST.id,
                    artist: DAVID_GUETTA_ARTIST,
                    summary: 'David Guetta matched on Spotify.',
                  },
                },
                {
                  toolName: 'checkHandle',
                  toolCallId: 'tool-david-handle',
                  input: { handle: 'davidguetta' },
                  output: {
                    action: 'check_handle',
                    handle: 'davidguetta',
                    summary: 'Checking @davidguetta.',
                  },
                },
              ],
            })
          : textAndToolsStream({
              messageId: 'assistant-david-access',
              text: "got it. the priority is converting a very large Spotify audience into one owned profile before the next release. @davidguetta is available; you're in.",
              tools: [
                {
                  toolName: 'recordInterviewSignal',
                  toolCallId: 'tool-david-signal',
                  input: {
                    audienceBand: 'over_500k',
                    currentTool: {
                      name: 'manual profile links',
                      note: 'Needs one owned profile before the next release.',
                    },
                    releaseStage: 'pre_announce',
                  },
                  output: {
                    action: 'signal_recorded',
                    recordedAt: new Date(
                      '2026-05-31T12:00:00.000Z'
                    ).toISOString(),
                    signal: {
                      audienceBand: 'over_500k',
                      currentTool: {
                        name: 'manual profile links',
                        note: 'Needs one owned profile before the next release.',
                      },
                      releaseStage: 'pre_announce',
                    },
                    signalCount: 1,
                    summary: 'Signal noted.',
                  },
                },
                {
                  toolName: 'proposeNextStep',
                  toolCallId: 'tool-david-next-step',
                  input: {
                    summary: 'David Guetta qualifies from Spotify data.',
                  },
                  output: {
                    action: 'propose_next_step',
                    decision: {
                      kind: 'instant_access',
                      rationale:
                        'Spotify followers exceed the access threshold.',
                      score: 100,
                    },
                    summary: 'Next step: instant access.',
                  },
                },
              ],
            });

    await route.fulfill({
      status: 200,
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream; charset=utf-8',
        'set-cookie':
          'jovie_onboarding_session=david-guetta-demo; Path=/; HttpOnly; SameSite=Lax',
      },
      body: stream,
    });
  });
}

test('records David Guetta Spotify-first onboarding demo', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await suppressDevToolbar(page);
  await mockDavidGuettaOnboarding(page);

  const prompt = "hey, I'm David Guetta. show me my Spotify.";
  await page.goto(`/start?starter_prompt=${encodeURIComponent(prompt)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await waitForHydration(page);

  const textarea = page.locator(COMPOSER_TEXTAREA);
  await expect(textarea).toHaveValue(prompt);

  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('verify the Spotify artist first')).toBeVisible();
  await expect(page.getByTestId('onboarding-artist-picker')).toBeVisible();
  await page
    .getByTestId('onboarding-artist-picker')
    .getByText('Use', { exact: true })
    .click();

  const sideRail = page.getByTestId('onboarding-profile-rail');
  await expect(sideRail).toBeVisible();
  await expect(sideRail.getByText('Building David Guetta')).toBeVisible();
  await expect(
    sideRail.getByText('28,000,000 Spotify followers')
  ).toBeVisible();
  await expect(
    sideRail.getByText('/davidguetta', { exact: true })
  ).toBeVisible();
  await expect(sideRail.getByTestId('onboarding-phone-preview')).toBeVisible();
  await expect(page.getByText('Spotify shows 28M followers')).toBeVisible();
  await expect(page.getByText('@davidguetta is available')).toBeVisible();

  await textarea.fill(
    'We need one owned profile ready before the next release.'
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText("You're in. Add an email to")).toBeVisible();
  await expect(
    page.getByText(/Use the dev toolbar|Add an email to keep going/)
  ).toBeVisible();

  await page.screenshot({
    path: 'test-results/onboarding-david-guetta-demo.png',
    fullPage: true,
  });

  const video = page.video();
  if (video) {
    await page.close();
    await video.saveAs('test-results/onboarding-david-guetta-demo.webm');
    testInfo.attach('onboarding-david-guetta-demo', {
      path: 'test-results/onboarding-david-guetta-demo.webm',
      contentType: 'video/webm',
    });
  }
});
