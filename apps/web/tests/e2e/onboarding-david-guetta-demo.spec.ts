import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
  trace: process.env.CI ? 'off' : 'on',
  video: 'off',
  viewport: { width: 1280, height: 720 },
});

type StreamChunk = Record<string, unknown>;

const DAVID_GUETTA_ARTIST = {
  id: '3pdSqTHnTx6tCEpR50zgc4',
  name: 'David Guetta',
  url: 'https://open.spotify.com/artist/3pdSqTHnTx6tCEpR50zgc4',
  imageUrl: 'https://i.scdn.co/image/ab6761610000e5ebf150017ca69c8793503c2d4f',
  followers: 28_000_000,
  popularity: null,
  genres: ['dance pop', 'edm'],
  dspMatches: [
    {
      id: 'apple-music',
      label: 'Apple Music',
      platform: 'applemusic',
      url: 'https://music.apple.com/us/artist/david-guetta/5557599',
    },
  ],
} as const;

const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';
const FALLBACK_ARTIST_IMAGE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeElEQVR4nO3PQQ3AIADAQMD+/5w9QnJ4QKZsZu2cJwAAAAAAAAAAAAAAANxq7g7wG7iBHYgb2IG4gR2IG9iBuIEdiBvYgbiBHYgb2IG4gR2IG9iBuIEdiBvYgbiBHYgb2IG4gR2IG9iBuIEdiBvYgbiBHYgb2IG4gR2IG9gB9bYCfQMD+LwAAAAASUVORK5CYII=';

interface ArtistImageFixture {
  readonly body: Buffer;
  readonly contentType: string;
}

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

function commandExists(command: string): boolean {
  return spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0;
}

function videoAverageLumaAt(path: string, seconds: number): number {
  const raw = execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    seconds.toFixed(2),
    '-i',
    path,
    '-frames:v',
    '1',
    '-vf',
    'scale=32:18,format=gray',
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
  if (raw.length === 0) return 255;
  return raw.reduce((sum, value) => sum + value, 0) / raw.length;
}

function videoRgbFrameAt(path: string, seconds: number): Buffer {
  try {
    return execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seconds.toFixed(2),
      '-i',
      path,
      '-frames:v',
      '1',
      '-vf',
      'scale=64:36,format=rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ]);
  } catch {
    return Buffer.alloc(0);
  }
}

function averageFrameDelta(reference: Buffer, candidate: Buffer): number {
  const byteLength = Math.min(reference.length, candidate.length);
  if (byteLength === 0) return 0;

  let totalDelta = 0;
  for (let i = 0; i < byteLength; i += 1) {
    totalDelta += Math.abs(reference[i] - candidate[i]);
  }

  return totalDelta / byteLength;
}

function trimVideoStart(path: string, startSeconds: number): void {
  if (startSeconds <= 0) return;

  const trimmedPath = path.replace(/\.webm$/u, '.trimmed.webm');
  rmSync(trimmedPath, { force: true });
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    path,
    '-vf',
    `trim=start=${startSeconds.toFixed(2)},setpts=PTS-STARTPTS`,
    '-an',
    '-c:v',
    'libvpx',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    trimmedPath,
  ]);
  if (!existsSync(trimmedPath)) {
    throw new Error('Failed to trim onboarding demo video');
  }
  renameSync(trimmedPath, path);
}

function trimLeadingWhiteFrames(path: string): void {
  if (!commandExists('ffmpeg')) {
    console.warn(
      '[onboarding-demo] ffmpeg unavailable; attaching raw demo video'
    );
    return;
  }

  let firstProductFrameAt = 0;
  for (let i = 0; i <= 80; i++) {
    const timestamp = i * 0.25;
    const averageLuma = videoAverageLumaAt(path, timestamp);
    if (averageLuma < 245) {
      firstProductFrameAt = timestamp;
      break;
    }
  }

  if (firstProductFrameAt > 0) {
    trimVideoStart(path, firstProductFrameAt);
  }

  const firstFrameLuma = videoAverageLumaAt(path, 0);
  expect(firstFrameLuma).toBeLessThan(245);
}

function trimLeadingIdleFrames(path: string): void {
  if (!commandExists('ffmpeg')) return;

  const referenceFrame = videoRgbFrameAt(path, 0);
  if (referenceFrame.length === 0) return;

  let firstChangedFrameAt = 0;
  for (let i = 1; i <= 80; i += 1) {
    const timestamp = i * 0.25;
    const frame = videoRgbFrameAt(path, timestamp);
    if (frame.length === 0) break;

    if (averageFrameDelta(referenceFrame, frame) > 2.5) {
      firstChangedFrameAt = timestamp;
      break;
    }
  }

  if (firstChangedFrameAt >= 0.25) {
    trimVideoStart(path, firstChangedFrameAt);
  }
}

async function attachDemoScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
) {
  const path = `test-results/onboarding-demo-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`onboarding-demo-${name}`, {
    path,
    contentType: 'image/png',
  });
}

async function mockDavidGuettaOnboarding(
  page: Page,
  artistImage?: ArtistImageFixture
) {
  let chatRequestCount = 0;

  if (artistImage && artistImage.body.length > 0) {
    await page.route('https://i.scdn.co/**', route =>
      route.fulfill({
        status: 200,
        contentType: artistImage.contentType,
        body: artistImage.body,
      })
    );
    await page.route('**/_next/image?**', route => {
      const sourceUrl = new URL(route.request().url()).searchParams.get('url');
      if (sourceUrl?.startsWith('https://i.scdn.co/')) {
        return route.fulfill({
          status: 200,
          contentType: artistImage.contentType,
          body: artistImage.body,
        });
      }
      return route.continue();
    });
  }

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
            text: "Awesome, let's do it. Verify the Spotify artist first, then I'll build the profile from supported data.",
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
              text: 'Pulled you up. Spotify shows 28M followers, so the access decision is easy; the sharper question is what this profile needs to convert right now.',
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
              text: "Got it. The priority is converting a very large Spotify audience into one owned profile before the next release. @davidguetta is available; you're in.",
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
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const prompt = "Hey, I'm David Guetta. Show me my Spotify.";

  const emptyContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 720 },
  });
  const emptyPage = await emptyContext.newPage();
  await suppressDevToolbar(emptyPage);
  await emptyPage.goto('/start', { waitUntil: 'domcontentloaded' });
  await waitForHydration(emptyPage);
  await expect(emptyPage.getByTestId('chat-empty-state-logo')).toBeVisible();
  await expect(
    emptyPage.getByTestId('chat-empty-state-centered-composer')
  ).toBeVisible();
  await attachDemoScreenshot(emptyPage, testInfo, 'empty-start');
  await emptyContext.close();

  const warmupResponse = await request.get(
    `/start?starter_prompt=${encodeURIComponent(prompt)}`
  );
  expect(warmupResponse.status()).toBeLessThan(500);

  let artistImage: ArtistImageFixture = {
    body: Buffer.from(FALLBACK_ARTIST_IMAGE_PNG_BASE64, 'base64'),
    contentType: 'image/png',
  };
  try {
    const artistImageResponse = await request.get(DAVID_GUETTA_ARTIST.imageUrl);
    if (artistImageResponse.ok()) {
      artistImage = {
        body: await artistImageResponse.body(),
        contentType:
          artistImageResponse.headers()['content-type'] ?? 'image/jpeg',
      };
    }
  } catch {
    console.warn(
      '[onboarding-demo] Spotify CDN image unavailable; using local fixture'
    );
  }

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: 'test-results',
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await suppressDevToolbar(page);
  await mockDavidGuettaOnboarding(page, artistImage);

  await page.goto(`/start?starter_prompt=${encodeURIComponent(prompt)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await waitForHydration(page);

  await expect(page.getByTestId('onboarding-chat')).toBeVisible();
  await expect(page.getByText(prompt)).toBeVisible();
  await attachDemoScreenshot(page, testInfo, 'auto-submitted-prompt');

  const textarea = page.locator(COMPOSER_TEXTAREA);
  await expect(page.getByText('Verify the Spotify artist first')).toBeVisible();
  await expect(page.getByTestId('onboarding-artist-picker')).toBeVisible();
  await expect(
    page.getByTestId('onboarding-artist-picker').getByText('David Guetta')
  ).toBeVisible();
  await expect(
    page
      .getByTestId('onboarding-artist-picker')
      .getByText('Use', { exact: true })
  ).toBeVisible();
  const pickerImage = page
    .getByTestId('onboarding-artist-picker')
    .locator('img')
    .first();
  await expect(pickerImage).toBeVisible();
  await expect
    .poll(() =>
      pickerImage.evaluate(image => {
        const img = image as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      })
    )
    .toBe(true);
  await attachDemoScreenshot(page, testInfo, 'spotify-picker');
  await page
    .getByTestId('onboarding-artist-picker')
    .getByText('Use', { exact: true })
    .click();

  const sideRail = page.getByTestId('onboarding-profile-rail');
  await expect(sideRail).toBeVisible();
  await expect(sideRail.getByTestId('onboarding-profile-bento')).toBeVisible();
  await expect(
    sideRail.getByTestId('onboarding-profile-compact-surface')
  ).toBeVisible();
  await expect(sideRail.getByText('David Guetta')).toHaveCount(1);
  await expect(
    sideRail.getByTestId('onboarding-dsp-match-strip')
  ).toBeVisible();
  await expect(sideRail.getByTitle('Apple Music').first()).toBeVisible();
  await expect(
    sideRail.getByText('28.0M Spotify followers').first()
  ).toBeVisible();
  await expect(sideRail.getByTestId('onboarding-phone-preview')).toBeVisible();
  await expect(
    sideRail.getByTestId('onboarding-phone-preview').locator('img').first()
  ).toBeVisible();
  await attachDemoScreenshot(page, testInfo, 'selected-artist-photo');
  await expect(page.getByText('Spotify shows 28M followers')).toBeVisible();
  const handleCard = page.getByTestId('onboarding-handle-check');
  await expect(handleCard.getByText('@davidguetta')).toBeVisible();
  await expect(handleCard.getByText('is available')).toBeVisible();
  await expect(handleCard.getByLabel('Edit Proposed Handle')).toBeVisible();
  await attachDemoScreenshot(page, testInfo, 'editable-handle');
  await attachDemoScreenshot(page, testInfo, 'profile-bento-preview');

  await textarea.fill(
    'We need one owned profile ready before the next release.'
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/Create your account|Add an email to keep going/)
  ).toBeVisible();
  await expect(page.getByText(/dev toolbar|local test user/i)).toHaveCount(0);

  await attachDemoScreenshot(page, testInfo, 'instant-access');

  const video = page.video();
  if (video) {
    await page.close();
    await video.saveAs('test-results/onboarding-david-guetta-demo.webm');
    trimLeadingWhiteFrames('test-results/onboarding-david-guetta-demo.webm');
    trimLeadingIdleFrames('test-results/onboarding-david-guetta-demo.webm');
    await testInfo.attach('onboarding-david-guetta-demo', {
      path: 'test-results/onboarding-david-guetta-demo.webm',
      contentType: 'video/webm',
    });
  } else {
    await page.close();
  }
  await context.close();
});
