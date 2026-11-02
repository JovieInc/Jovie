import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { fetchChannelAuditData } from './channel-audit-data';

function json(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 403, json: async () => body } as Response;
}

function fakeFetch() {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/channels')) {
      expect(u.searchParams.get('forHandle')).toBe('@cassarden');
      return json({
        items: [
          {
            id: 'UCx',
            snippet: { title: 'Cass Arden', description: 'hi' },
            statistics: { subscriberCount: '24100', videoCount: '61' },
            contentDetails: { relatedPlaylists: { uploads: 'UUx' } },
          },
        ],
      });
    }
    if (u.pathname.endsWith('/playlistItems')) {
      return json({
        items: [
          {
            contentDetails: {
              videoId: 'a',
              videoPublishedAt: '2020-01-01T00:00:00Z',
            },
          },
          {
            contentDetails: {
              videoId: 'b',
              videoPublishedAt: '2026-03-01T00:00:00Z',
            },
          },
        ],
      });
    }
    if (u.pathname.endsWith('/videos')) {
      return json({
        items: [
          { id: 'a', snippet: { title: 'A' }, statistics: { viewCount: '10' } },
          {
            id: 'b',
            snippet: { title: 'B' },
            statistics: { viewCount: '900' },
          },
        ],
      });
    }
    return json({ pageInfo: { totalResults: 3 } });
  });
}

describe('fetchChannelAuditData', () => {
  it('fails soft without a key and never calls the API', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchChannelAuditData(
      'https://www.youtube.com/@cassarden',
      { apiKey: '', fetchImpl: fetchImpl as never }
    );
    expect(result).toEqual({ ok: false, reason: 'no_api_key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-channel URL before any call', async () => {
    const result = await fetchChannelAuditData('https://example.com/x', {
      apiKey: 'k',
      fetchImpl: vi.fn() as never,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_channel_ref' });
  });

  it('returns stats, playlist count, last upload and views-ranked videos', async () => {
    const result = await fetchChannelAuditData(
      'https://www.youtube.com/@cassarden',
      { apiKey: 'k', fetchImpl: fakeFetch() as never }
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.channel).toMatchObject({
      subscriberCount: 24_100,
      playlistCount: 3,
      lastUploadAt: '2026-03-01T00:00:00Z',
    });
    expect(result.topVideos.map(v => v.videoId)).toEqual(['b', 'a']);
  });

  it('maps an API error to api_error', async () => {
    const result = await fetchChannelAuditData(
      'https://www.youtube.com/@cassarden',
      { apiKey: 'k', fetchImpl: vi.fn(async () => json({}, false)) as never }
    );
    expect(result).toEqual({ ok: false, reason: 'api_error' });
  });
});
