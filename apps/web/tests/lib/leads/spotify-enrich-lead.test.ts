import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockUpdateSet,
  mockGetArtist,
  mockGetAccessToken,
  mockStartSpan,
  mockCaptureException,
  mockCaptureError,
  mockPipelineLog,
  mockPipelineWarn,
} = vi.hoisted(() => {
  const mockSelectLimit = vi
    .fn()
    .mockResolvedValue([
      { spotifyUrl: 'https://open.spotify.com/artist/artist123' },
    ]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  return {
    mockDb: { select: mockSelect, update: mockUpdate },
    mockUpdateSet,
    mockGetArtist: vi.fn(),
    mockGetAccessToken: vi.fn(),
    mockStartSpan: vi.fn(),
    mockCaptureException: vi.fn(),
    mockCaptureError: vi.fn().mockResolvedValue(undefined),
    mockPipelineLog: vi.fn(),
    mockPipelineWarn: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema/leads', () => ({
  leads: { id: 'id', spotifyUrl: 'spotify_url' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => null) }));
vi.mock('@/lib/spotify', () => ({
  spotifyClient: {
    getArtist: mockGetArtist,
    getAccessToken: mockGetAccessToken,
  },
}));
vi.mock('@/lib/spotify/env', () => ({
  SPOTIFY_API_BASE: 'https://api.spotify.test/v1',
}));
vi.mock('@sentry/nextjs', () => ({
  startSpan: mockStartSpan,
  addBreadcrumb: vi.fn(),
  captureException: mockCaptureException,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineLog: mockPipelineLog,
  pipelineWarn: mockPipelineWarn,
}));

import { spotifyEnrichLead } from '@/lib/leads/spotify-enrich-lead';

describe('spotifyEnrichLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartSpan.mockImplementation(
      async (_options: unknown, callback: (span: unknown) => unknown) =>
        callback({
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
        })
    );
    mockGetArtist.mockResolvedValue({
      spotifyId: 'artist123',
      name: 'Test Artist',
      bio: null,
      imageUrl: null,
      genres: ['pop', 'bedroom pop'],
      followerCount: 1200,
      popularity: 42,
      externalUrls: {},
    });
    mockGetAccessToken.mockResolvedValue('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          total: 3,
          items: [{ release_date: '2026-08-01', album_type: 'single' }],
        }),
      })
    );
  });

  it('supports a public fetch-only mode without updating the lead', async () => {
    const result = await spotifyEnrichLead('lead-1', { persist: false });

    expect(result.status).toBe('enriched');
    expect(result.spotifyPopularity).toBe(42);
    expect(result.spotifyGenres).toEqual(['bedroom pop', 'pop']);
    expect(result.releaseCount).toBe(3);
    expect(mockDb.select).toHaveBeenCalledWith({ spotifyUrl: 'spotify_url' });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('preserves existing release fields when the albums source is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );

    const result = await spotifyEnrichLead('lead-1');

    expect(result.status).toBe('partial');
    expect(result.releaseCount).toBeNull();
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet.mock.calls[0]?.[0]).not.toHaveProperty('releaseCount');
    expect(mockUpdateSet.mock.calls[0]?.[0]).not.toHaveProperty(
      'latestReleaseDate'
    );
  });
});
