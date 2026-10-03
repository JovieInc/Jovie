import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ISOLATED_EGRESS_SKIP_REASON } from './egress';

vi.mock('server-only', () => ({}));
const serverFetch = vi.hoisted(() => vi.fn());
const getMusicBrainzArtist = vi.hoisted(() => vi.fn());
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch }));
vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => {
  class MusicBrainzError extends Error {
    readonly statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { getMusicBrainzArtist, MusicBrainzError };
});
function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}
describe('core artist snapshot fetchers', () => {
  beforeEach(() => {
    serverFetch.mockReset();
    getMusicBrainzArtist.mockReset();
    delete process.env.YOUTUBE_DATA_API_KEY;
  });
  it('skips social HTML and an unset YouTube key without a request', async () => {
    const { fetchInstagramSnapshot, fetchYouTubeSnapshot } = await import(
      './fetchers'
    );
    const { youtubeLoggedOutPageSnapshotFromCore } = await import('./egress');
    await expect(fetchInstagramSnapshot()).resolves.toMatchObject({
      kind: 'skip',
      reason: ISOLATED_EGRESS_SKIP_REASON,
      source: 'instagram',
    });
    expect(youtubeLoggedOutPageSnapshotFromCore().source).toBe(
      'youtube_logged_out_page'
    );
    await expect(
      fetchYouTubeSnapshot('https://www.youtube.com/@arista/about')
    ).resolves.toEqual({ kind: 'skip', reason: 'youtube_data_api_key_unset' });
    expect(serverFetch).not.toHaveBeenCalled();
  });
  it('stores exact API statistics and refuses rounded YouTube text', async () => {
    process.env.YOUTUBE_DATA_API_KEY = 'existing-key';
    const { fetchYouTubeSnapshot } = await import('./fetchers');
    serverFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          {
            id: 'UCabcdefghijklmnopqrstuv',
            statistics: {
              subscriberCount: '29200',
              viewCount: '1000',
              videoCount: '532',
            },
          },
        ],
      })
    );
    const ready = await fetchYouTubeSnapshot(
      'https://www.youtube.com/@arista/about'
    );
    expect(ready).toMatchObject({
      kind: 'ready',
      rawValues: {
        precision: 'exact',
        subscriberCount: 29200,
        videoCount: 532,
      },
    });
    const requested = String(serverFetch.mock.calls[0]?.[0]);
    expect(requested).toContain('googleapis.com/youtube/v3/channels');
    expect(requested).toContain('part=statistics');
    expect(requested).not.toContain('youtube.com');
    serverFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          {
            id: 'UCabcdefghijklmnopqrstuv',
            statistics: { subscriberCount: '4.12K', videoCount: '105' },
          },
        ],
      })
    );
    await expect(
      fetchYouTubeSnapshot('https://www.youtube.com/@arista/about')
    ).resolves.toMatchObject({ kind: 'failure', reason: 'counts_not_exact' });
    const { youtubeCountsFromApiStatistics } = await import('./counts');
    expect(
      youtubeCountsFromApiStatistics({
        channelId: 'UCabcdefghijklmnopqrstuv',
        subscriberCount: '9',
        viewCount: '20',
        videoCount: '3',
        hiddenSubscriberCount: true,
      })
    ).toMatchObject({
      precision: 'exact',
      subscriberCount: null,
      viewCount: 20,
    });
  });
  it('records exact Wikimedia pageviews from a MusicBrainz QID', async () => {
    getMusicBrainzArtist.mockResolvedValue({
      relations: [{ url: { resource: 'https://www.wikidata.org/wiki/Q42' } }],
    });
    serverFetch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          entities: {
            Q42: { sitelinks: { enwiki: { title: 'Ada Lovelace' } } },
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { items: [{ views: 321 }] }));
    const { fetchWikipediaSnapshot } = await import('./fetchers');
    const ready = await fetchWikipediaSnapshot({
      musicbrainzId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      pageviewDay: '2026-10-01',
    });
    expect(ready).toMatchObject({
      kind: 'ready',
      rawValues: { precision: 'exact', qid: 'Q42', pageviews: 321 },
    });
    const hosts = serverFetch.mock.calls.map(call => String(call[0]));
    expect(hosts.join(' ')).toContain('sitefilter=enwiki');
    expect(hosts.join(' ')).toContain('Ada_Lovelace/daily/20261001/20261001');
  });
});
