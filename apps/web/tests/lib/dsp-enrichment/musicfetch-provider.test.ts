import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockMusicfetchRequest = vi.fn();
const mockStartSpan = vi.fn(
  async (
    _options: unknown,
    callback: (span: {
      setStatus: (status: unknown) => void;
    }) => Promise<unknown>
  ) =>
    callback({
      setStatus: vi.fn(),
    })
);

vi.mock('@/lib/env-server', () => ({
  env: {
    MUSICFETCH_API_TOKEN: 'test-token',
  },
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  startSpan: (
    options: unknown,
    callback: (span: {
      setStatus: (status: unknown) => void;
    }) => Promise<unknown>
  ) => mockStartSpan(options, callback),
}));

vi.mock('@/lib/musicfetch/resilient-client', () => ({
  musicfetchRequest: (...args: unknown[]) => mockMusicfetchRequest(...args),
  isMusicfetchInvalidServicesError: vi.fn(() => false),
  MusicfetchBudgetExceededError: class extends Error {},
  MusicfetchRequestError: class extends Error {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('musicfetch artist lookup provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMusicfetchRequest.mockResolvedValue({
      result: {
        type: 'artist',
        name: 'Dua Lipa',
        services: {},
      },
    });
  });

  it('uses a supported service allowlist for artist lookups', async () => {
    const provider = await import('@/lib/dsp-enrichment/providers/musicfetch');

    expect(provider.MUSICFETCH_ARTIST_LOOKUP_SERVICES).not.toContain(
      'allMusic'
    );
    expect(provider.MUSICFETCH_ARTIST_LOOKUP_SERVICES).not.toContain(
      'youtubeShorts'
    );
    expect(provider.MUSICFETCH_ARTIST_LOOKUP_SERVICES).not.toContain('napster');
    expect(provider.MUSICFETCH_ARTIST_LOOKUP_SERVICES).not.toContain(
      'telmoreMusik'
    );

    await provider.fetchArtistBySpotifyUrl(
      'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we'
    );

    expect(mockMusicfetchRequest).toHaveBeenCalledTimes(1);
    expect(mockMusicfetchRequest).toHaveBeenCalledWith(
      '/url',
      expect.any(URLSearchParams),
      expect.objectContaining({ timeoutMs: 15_000 })
    );

    const [, params] = mockMusicfetchRequest.mock.calls[0] as [
      string,
      URLSearchParams,
    ];
    expect(params.get('services')).toBe(
      provider.MUSICFETCH_ARTIST_LOOKUP_SERVICES.join(',')
    );
  });
});
