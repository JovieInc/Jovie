import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YoutubeClosedLoopDogfoodReceipt } from '@/lib/acquisition/youtube-closed-loop-dogfood';
import { dogfoodYoutubeClosedLoop } from '@/scripts/youtube-closed-loop-dogfood';

const mocks = vi.hoisted(() => ({
  getVideo: vi.fn(),
  updateVideo: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));
vi.mock('@/lib/connectors/youtube/provider', () => ({
  createYouTubeSnippetWriter: () => ({
    getVideo: mocks.getVideo,
    updateVideo: mocks.updateVideo,
  }),
}));
vi.mock('@/lib/youtube/resolve-channel', () => ({
  parseYouTubeChannelInput: vi.fn(),
  resolveYouTubeChannel: vi.fn(),
  listRecentPublicVideos: vi.fn(),
}));

const channelId = 'UCtestchannel';
const items = ['video-1', 'video-2', 'video-3'].map(videoId => ({
  videoId,
  title: videoId,
  beforeUrl: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
  afterUrl: `https://example.com/${videoId}.jpg`,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('YOUTUBE_ACCESS_TOKEN', 'test-connect-grant');
  vi.stubEnv('YOUTUBE_DATA_API_KEY', '');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mocks.getVideo.mockImplementation(async (videoId: string) => ({
    id: videoId,
    etag: 'observed-etag',
    snippet: {
      title: videoId,
      channelId,
      description: 'Existing description',
      categoryId: '10',
    },
  }));
  mocks.updateVideo.mockRejectedValue(new Error('Unauthorized write attempt'));
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://oauth2.googleapis.com/tokeninfo?')) {
        return new Response(
          JSON.stringify({
            scope: 'https://www.googleapis.com/auth/youtube.upload',
          })
        );
      }
      if (
        url === 'https://example.com/api/youtube-thumbnails/preview' &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            ok: true,
            channel: { id: channelId, title: 'Test channel', handle: 'test' },
            mode: 'before_after',
            items,
          })
        );
      }
      throw new Error('Unexpected network request');
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function runScript() {
  return dogfoodYoutubeClosedLoop([
    '--channel',
    '@test',
    '--output',
    '/tmp/youtube-inspection-test',
    '--base-url',
    'https://example.com',
    '--jovie-origin',
    'https://jov.ie',
    '--jovie-handle',
    'test',
  ]);
}

function writtenReceipt(): YoutubeClosedLoopDogfoodReceipt {
  return JSON.parse(mocks.writeFile.mock.calls[0][1]);
}

describe('YouTube dogfood script approval boundary', () => {
  it('keeps write-scoped token runs inspection-only through the real harness', async () => {
    expect(await runScript()).toBe(0);
    expect(mocks.getVideo).toHaveBeenCalledTimes(3);
    expect(mocks.updateVideo).not.toHaveBeenCalled();
    const receipt = writtenReceipt();
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toBe('connect_apply');
    expect(receipt.guardrails.videosUpdateCalls).toBe(0);
    expect(receipt.apply.linksInserted).toBe(0);
    expect(
      receipt.apply.results.every(
        row => !row.applied && row.plan?.action === 'insert'
      )
    ).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { mode: 0o600, flag: 'wx' }
    );
    expect(console.log).toHaveBeenCalledWith(
      'Live apply not attempted. Review exact proposals through Jovie before applying.'
    );
  });

  it('emits a blocked inspection receipt without a token and never constructs a write attempt', async () => {
    vi.stubEnv('YOUTUBE_ACCESS_TOKEN', '');
    expect(await runScript()).toBe(0);
    expect(mocks.getVideo).not.toHaveBeenCalled();
    expect(mocks.updateVideo).not.toHaveBeenCalled();
    expect(writtenReceipt().apply).toMatchObject({
      authState: 'missing',
      videosEvaluated: 0,
      linksInserted: 0,
    });
    expect(writtenReceipt().outcome).toBe('blocked');
  });
});
