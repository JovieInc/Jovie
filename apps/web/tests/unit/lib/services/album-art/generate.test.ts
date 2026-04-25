import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  burstLimitMock: vi.fn(),
  dailyLimitMock: vi.fn(),
  fetchReleasesForChatMock: vi.fn(),
  generateAlbumArtBackgroundsMock: vi.fn(),
  renderAlbumArtCandidateMock: vi.fn(),
  uploadAlbumArtCandidateMock: vi.fn(),
  uploadAlbumArtManifestMock: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  albumArtGenerationBurstLimiter: { limit: hoisted.burstLimitMock },
  albumArtGenerationLimiter: { limit: hoisted.dailyLimitMock },
}));

vi.mock('@/lib/chat/tools/shared', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/chat/tools/shared')>();
  return {
    ...actual,
    fetchReleasesForChat: hoisted.fetchReleasesForChatMock,
  };
});

vi.mock('@/lib/services/album-art/provider-xai', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/services/album-art/provider-xai')
    >();
  return {
    ...actual,
    generateAlbumArtBackgrounds: hoisted.generateAlbumArtBackgroundsMock,
  };
});

vi.mock('@/lib/services/album-art/render', () => ({
  renderAlbumArtCandidate: hoisted.renderAlbumArtCandidateMock,
}));

vi.mock('@/lib/services/album-art/storage', () => ({
  uploadAlbumArtCandidate: hoisted.uploadAlbumArtCandidateMock,
  uploadAlbumArtManifest: hoisted.uploadAlbumArtManifestMock,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('generateAlbumArtForChat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.burstLimitMock.mockResolvedValue({ success: true });
    hoisted.dailyLimitMock.mockResolvedValue({ success: true });
    hoisted.fetchReleasesForChatMock.mockResolvedValue([
      {
        id: 'rel_1',
        title: 'Midnight Drive',
        releaseType: 'single',
        releaseDate: '2026-01-01T00:00:00.000Z',
        artworkUrl: null,
        spotifyPopularity: 50,
        totalTracks: 1,
        canvasStatus: 'not_set',
        metadata: {},
      },
    ]);
    hoisted.uploadAlbumArtCandidateMock.mockResolvedValue({
      previewUrl: 'https://example.com/preview.jpg',
      fullResUrl: 'https://example.com/full.jpg',
    });
    hoisted.uploadAlbumArtManifestMock.mockResolvedValue(
      'https://example.com/manifest.json'
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when xAI is not configured', async () => {
    vi.stubEnv('XAI_API_KEY', '');
    const { generateAlbumArtForChat } = await import(
      '@/lib/services/album-art/generate'
    );

    const result = await generateAlbumArtForChat({
      profileId: 'profile_1',
      clerkUserId: 'user_1',
      artistName: 'Tim White',
      releaseTitle: 'Midnight Drive',
    });

    expect(result).toEqual({
      success: false,
      retryable: false,
      error: 'Album art is temporarily unavailable.',
    });
  });

  it('starts rendering all candidates without serially waiting for the first one', async () => {
    vi.stubEnv('XAI_API_KEY', 'xai_test');
    hoisted.generateAlbumArtBackgroundsMock.mockResolvedValue({
      model: 'grok-imagine-image',
      images: [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')],
    });

    const first = deferred<{ fullRes: Buffer; preview: Buffer }>();
    const second = deferred<{ fullRes: Buffer; preview: Buffer }>();
    const third = deferred<{ fullRes: Buffer; preview: Buffer }>();
    hoisted.renderAlbumArtCandidateMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);

    const { generateAlbumArtForChat } = await import(
      '@/lib/services/album-art/generate'
    );

    const pending = generateAlbumArtForChat({
      profileId: 'profile_1',
      clerkUserId: 'user_1',
      artistName: 'Tim White',
      releaseTitle: 'Midnight Drive',
    });

    await vi.waitFor(() => {
      expect(hoisted.renderAlbumArtCandidateMock).toHaveBeenCalledTimes(3);
    });

    first.resolve({ fullRes: Buffer.from('a'), preview: Buffer.from('b') });
    second.resolve({ fullRes: Buffer.from('c'), preview: Buffer.from('d') });
    third.resolve({ fullRes: Buffer.from('e'), preview: Buffer.from('f') });

    const result = await pending;
    expect(result).toMatchObject({
      success: true,
      state: 'generated',
      releaseTitle: 'Midnight Drive',
    });
  });
});
