import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverFetch } from '@/lib/http/server-fetch';
import { decideYouTubeOnboardingAccess } from './onboarding-youtube-access';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: vi.fn() }));

const channelUrl = 'https://www.youtube.com/@testartist';
const base = {
  accessControlled: true,
  spotifyArtistId: null,
  spotifyFollowers: 0,
  publicProfileUrl: channelUrl,
  signals: [
    {
      isMusicArtist: true,
      pastBehavior:
        'I linked my last music video from my profile and lost the link in the next release.',
      youtubeChannelUrl: channelUrl,
    },
  ],
  turnCount: 3,
};

function uploads(dates: readonly string[], categoryId = '10') {
  vi.mocked(serverFetch)
    .mockResolvedValueOnce(
      Response.json({
        items: [
          {
            id: 'UC1234567890123456789012',
            snippet: { title: 'Test artist' },
            contentDetails: { relatedPlaylists: { uploads: 'UU123' } },
          },
        ],
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        items: dates.map((_, i) => ({
          contentDetails: { videoId: `video-${i}` },
        })),
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        items: dates.map((publishedAt, i) => ({
          id: `video-${i}`,
          status: { privacyStatus: 'public' },
          snippet: {
            publishedAt,
            categoryId,
            thumbnails: {
              high: { url: `https://i.ytimg.com/vi/video-${i}/hqdefault.jpg` },
            },
          },
        })),
      })
    );
}

describe('YouTube artist interview admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'unit-test-key');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('admits a music artist without Spotify using actual public upload evidence', async () => {
    uploads(['2026-10-20', '2026-09-01', '2026-01-01']);
    expect(await decideYouTubeOnboardingAccess(base)).toMatchObject({
      kind: 'instant_access',
      rationale: 'regularly_uploading_youtube_music_artist',
    });
    expect(serverFetch).toHaveBeenCalledTimes(3);
    expect(serverFetch).toHaveBeenCalledWith(
      expect.stringContaining('/videos?'),
      expect.objectContaining({ timeoutMs: 10_000 })
    );
  });

  it.each([
    [['2026-01-01', '2026-02-01', '2026-10-20'], '10'],
    [['2026-10-20', '2026-10-19'], '10'],
    [['2026-10-20', '2027-01-01', 'invalid-date'], '10'],
  ])(
    'waitlists sparse and invalid upload histories',
    async (dates, categoryId) => {
      uploads(dates, categoryId);
      expect((await decideYouTubeOnboardingAccess(base)).kind).toBe('waitlist');
    }
  );

  it('does not resolve a channel or finish admission before the interview', async () => {
    expect(
      (
        await decideYouTubeOnboardingAccess({
          ...base,
          signals: [{ isMusicArtist: true, youtubeChannelUrl: channelUrl }],
        })
      ).kind
    ).toBe('needs_more_info');
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it('waitlists Spotify-only artists even with a large verified audience and the global gate off', async () => {
    expect(
      (
        await decideYouTubeOnboardingAccess({
          ...base,
          accessControlled: false,
          spotifyArtistId: 'artist',
          spotifyFollowers: 50_000,
          publicProfileUrl: 'https://instagram.com/artist',
          signals: [
            { pastBehavior: base.signals[0].pastBehavior, isMusicArtist: true },
          ],
        })
      ).kind
    ).toBe('waitlist');
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it("does not qualify a non-artist with someone else's music channel", async () => {
    expect(
      (
        await decideYouTubeOnboardingAccess({
          ...base,
          signals: [{ ...base.signals[0], isMusicArtist: false }],
        })
      ).kind
    ).toBe('waitlist');
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it.each(['missing-key', 'outage', 'not-found'])(
    'fails closed on %s',
    async failure => {
      if (failure === 'missing-key') vi.stubEnv('YOUTUBE_DATA_API_KEY', '');
      else if (failure === 'outage')
        vi.mocked(serverFetch).mockRejectedValueOnce(new Error('offline'));
      else
        vi.mocked(serverFetch).mockResolvedValueOnce(
          Response.json({ items: [] })
        );
      expect((await decideYouTubeOnboardingAccess(base)).kind).toBe('waitlist');
    }
  );
});
