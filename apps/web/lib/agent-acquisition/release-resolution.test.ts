import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const request = vi.fn();
vi.mock('@/lib/musicfetch/resilient-client', () => {
  class MusicfetchRequestError extends Error {
    constructor(
      message: string,
      readonly statusCode?: number
    ) {
      super(message);
    }
  }
  return {
    MusicfetchRequestError,
    musicfetchRequest: (...args: unknown[]) => request(...args),
  };
});

import { prepareReleaseLaunchSchema } from './draft-contract';
import { resolveAgentRelease } from './release-resolution';

const draft = {
  draft_id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
  draft_token: 'private.token',
  goal: 'Launch the single',
};

describe('agent release resolution', () => {
  beforeEach(() => vi.resetAllMocks());

  it('resolves a DSP URL into normalized public release and smart-link facts', async () => {
    request.mockResolvedValue({
      result: {
        type: 'album',
        name: 'Signal Fire',
        releaseDate: '2026-11-07T00:00:00.000Z',
        upc: '00123456789012',
        image: { url: 'https://i.scdn.co/image/cover' },
        artists: [
          {
            name: 'The Artist',
            services: { spotify: { id: 'artist-id' } },
          },
        ],
        services: {
          spotify: {
            url: 'https://open.spotify.com/album/release-id',
          },
          appleMusic: {
            link: 'https://music.apple.com/us/album/signal-fire/1234',
          },
          genius: { url: 'https://genius.com/albums/not-a-listen-dsp' },
        },
      },
    });
    const input = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://open.spotify.com/album/release-id',
    });

    await expect(resolveAgentRelease(input)).resolves.toEqual({
      status: 'resolved',
      facts: [
        {
          source: 'release_url',
          content_type: 'album',
          title: 'Signal Fire',
          artist_name: 'The Artist',
          release_date: '2026-11-07',
          artwork_url: 'https://i.scdn.co/image/cover',
          upc: '00123456789012',
          dsp_links: {
            spotify: 'https://open.spotify.com/album/release-id',
            apple_music: 'https://music.apple.com/us/album/signal-fire/1234',
          },
          artist_ids: { spotify: 'artist-id' },
        },
      ],
    });
    expect(request).toHaveBeenCalledWith('/url', expect.any(URLSearchParams), {
      timeoutMs: 15_000,
    });
  });

  it('uses the requested UPC when the provider omits it', async () => {
    request.mockResolvedValue({
      result: {
        type: 'album',
        name: 'Signal Fire',
        artists: [{ name: 'The Artist' }],
        services: {},
      },
    });
    const input = prepareReleaseLaunchSchema.parse({
      ...draft,
      upc: '00123456789012',
    });
    const result = await resolveAgentRelease(input);
    expect(result).toMatchObject({
      status: 'resolved',
      facts: [{ source: 'upc', upc: '00123456789012' }],
    });
    const params = request.mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('upc')).toBe('00123456789012');
  });

  it('accepts metadata without an upstream call and rejects untrusted DSP keys', async () => {
    const valid = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_metadata: {
        title: 'Signal Fire',
        artist_name: 'The Artist',
        dsp_links: {
          spotify: 'https://open.spotify.com/album/release-id',
        },
      },
    });
    expect(await resolveAgentRelease(valid)).toMatchObject({
      status: 'resolved',
      facts: [
        {
          source: 'release_metadata',
          title: 'Signal Fire',
          dsp_links: {
            spotify: 'https://open.spotify.com/album/release-id',
          },
        },
      ],
    });
    const invalid = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_metadata: {
        dsp_links: { spotify: 'https://attacker.example/album/1' },
      },
    });
    expect(await resolveAgentRelease(invalid)).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects unsupported URLs and separates permanent from retryable provider failures', async () => {
    const unsupported = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://example.com/release/1',
    });
    expect(await resolveAgentRelease(unsupported)).toEqual({
      status: 'error',
      code: 'UNSUPPORTED_RELEASE',
      retryable: false,
    });
    const supported = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://open.spotify.com/album/release-id',
    });
    const { MusicfetchRequestError } = await import(
      '@/lib/musicfetch/resilient-client'
    );
    request.mockRejectedValueOnce(new MusicfetchRequestError('bad URL', 400));
    expect(await resolveAgentRelease(supported)).toMatchObject({
      code: 'RELEASE_NOT_FOUND',
      retryable: false,
    });
    request.mockRejectedValueOnce(new MusicfetchRequestError('timeout'));
    expect(await resolveAgentRelease(supported)).toMatchObject({
      code: 'UPSTREAM_FAILURE',
      retryable: true,
    });
  });
});
