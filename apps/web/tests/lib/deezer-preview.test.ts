import { describe, expect, it, vi } from 'vitest';
import { lookupDeezerByIsrc } from '@/lib/discography/provider-links';

describe('Deezer preview URL extraction', () => {
  const makeResponse = (payload: unknown) =>
    ({
      ok: true,
      json: async () => payload,
    }) as unknown as Response;

  it('returns previewUrl from Deezer response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        id: 123456,
        link: 'https://www.deezer.com/track/123456',
        preview: 'https://cdnt-preview.dzcdn.net/stream/c-abc123.mp3',
        album: { id: 789, link: 'https://www.deezer.com/album/789' },
      })
    );

    const result = await lookupDeezerByIsrc('USRC12345678', {
      fetcher: fetchMock,
    });

    expect(result).not.toBeNull();
    expect(result!.previewUrl).toBe(
      'https://cdnt-preview.dzcdn.net/stream/c-abc123.mp3'
    );
    expect(result!.url).toBe('https://www.deezer.com/track/123456');
    expect(result!.albumUrl).toBe('https://www.deezer.com/album/789');
  });

  it('normalizes empty string preview to null', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        id: 123456,
        link: 'https://www.deezer.com/track/123456',
        preview: '',
        album: { id: 789, link: 'https://www.deezer.com/album/789' },
      })
    );

    const result = await lookupDeezerByIsrc('USRC12345678', {
      fetcher: fetchMock,
    });

    expect(result).not.toBeNull();
    expect(result!.previewUrl).toBeNull();
  });

  it('returns null previewUrl when field is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        id: 123456,
        link: 'https://www.deezer.com/track/123456',
        album: { id: 789, link: 'https://www.deezer.com/album/789' },
      })
    );

    const result = await lookupDeezerByIsrc('USRC12345678', {
      fetcher: fetchMock,
    });

    expect(result).not.toBeNull();
    expect(result!.previewUrl).toBeNull();
  });

  it('normalizes whitespace-only preview to null', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        id: 123456,
        link: 'https://www.deezer.com/track/123456',
        preview: '   ',
        album: { id: 789, link: 'https://www.deezer.com/album/789' },
      })
    );

    const result = await lookupDeezerByIsrc('USRC12345678', {
      fetcher: fetchMock,
    });

    expect(result).not.toBeNull();
    expect(result!.previewUrl).toBeNull();
  });

  it('rejects http:// preview URLs (non-HTTPS)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        id: 123456,
        link: 'https://www.deezer.com/track/123456',
        preview: 'http://evil.example.com/track.mp3',
        album: { id: 789, link: 'https://www.deezer.com/album/789' },
      })
    );

    const result = await lookupDeezerByIsrc('USRC12345678', {
      fetcher: fetchMock,
    });

    expect(result).not.toBeNull();
    expect(result!.previewUrl).toBeNull();
  });

  it('handles non-string preview gracefully', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        id: 123456,
        link: 'https://www.deezer.com/track/123456',
        preview: 12345,
        album: { id: 789, link: 'https://www.deezer.com/album/789' },
      })
    );

    const result = await lookupDeezerByIsrc('USRC12345678', {
      fetcher: fetchMock,
    });

    expect(result).not.toBeNull();
    expect(result!.previewUrl).toBeNull();
    // Should still return the track link
    expect(result!.url).toBe('https://www.deezer.com/track/123456');
  });

  it('returns null when Deezer returns error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeResponse({
        error: { type: 'DataException', message: 'no data' },
      })
    );

    const result = await lookupDeezerByIsrc('INVALID', {
      fetcher: fetchMock,
    });

    expect(result).toBeNull();
  });
});
