import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseContext } from '../types';

const mocks = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  burstLimit: vi.fn(),
  dailyLimit: vi.fn(),
  gatewayConfigured: vi.fn(),
  generateBackgrounds: vi.fn(),
  render: vi.fn(),
  uploadCandidate: vi.fn(),
  uploadManifest: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}));
vi.mock('../album-art-release-target', () => ({
  resolveAlbumArtReleaseTarget: mocks.resolveTarget,
}));
vi.mock('@/lib/rate-limit', () => ({
  albumArtGenerationBurstLimiter: { limit: mocks.burstLimit },
  albumArtGenerationLimiter: { limit: mocks.dailyLimit },
}));
vi.mock('@/lib/services/album-art/provider-xai', () => {
  class AlbumArtGatewayUnconfiguredError extends Error {}
  return {
    AlbumArtGatewayUnconfiguredError,
    buildAlbumArtBackgroundPrompt: vi.fn(() => 'stub prompt'),
    generateAlbumArtBackgrounds: mocks.generateBackgrounds,
    isAlbumArtGatewayConfigured: mocks.gatewayConfigured,
  };
});
vi.mock('@/lib/services/album-art/render', () => ({
  renderAlbumArtCandidate: mocks.render,
}));
vi.mock('@/lib/services/album-art/storage', () => ({
  uploadAlbumArtCandidate: mocks.uploadCandidate,
  uploadAlbumArtManifest: mocks.uploadManifest,
}));

const { createGenerateAlbumArtTool } = await import('./album-art');
const { AlbumArtGatewayUnconfiguredError } = await import(
  '@/lib/services/album-art/provider-xai'
);

type Execute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  state?: string;
  errorCode?: string;
  retryable?: boolean;
  releaseId?: string | null;
  releaseTitle?: string | null;
  hasExistingArtwork?: boolean;
  candidates?: { id: string; fullResUrl: string }[];
  suggestedReleases?: unknown[];
}>;

function release(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return {
    id: 'rel-1',
    title: 'Night Bus',
    releaseType: 'single',
    releaseDate: null,
    artworkUrl: 'https://example.com/old.jpg',
    spotifyPopularity: null,
    totalTracks: 1,
    canvasStatus: 'not_set',
    metadata: {},
    ...overrides,
  };
}

function albumArt(
  overrides: Partial<Parameters<typeof createGenerateAlbumArtTool>[0]> = {}
) {
  return createGenerateAlbumArtTool({
    profileId: 'profile-1',
    clerkUserId: 'clerk-1',
    artistName: 'Cover Artist',
    canGenerateAlbumArt: true,
    releases: [release()],
    ...overrides,
  }).execute as unknown as Execute;
}

describe('generateAlbumArt chat tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gatewayConfigured.mockReturnValue(true);
    mocks.burstLimit.mockResolvedValue({ success: true });
    mocks.dailyLimit.mockResolvedValue({ success: true });
    mocks.resolveTarget.mockResolvedValue({
      status: 'resolved',
      release: release(),
    });
    mocks.generateBackgrounds.mockResolvedValue({
      images: [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')],
      model: 'stub-model',
    });
    mocks.render.mockResolvedValue({
      fullRes: Buffer.from('full'),
      preview: Buffer.from('preview'),
    });
    mocks.uploadCandidate.mockImplementation(
      async ({ candidateId }: { candidateId: string }) => ({
        fullResUrl: `https://blob.test/${candidateId}.jpg`,
        previewUrl: `https://blob.test/${candidateId}-preview.jpg`,
      })
    );
    mocks.uploadManifest.mockResolvedValue('https://blob.test/manifest.json');
  });

  it('needs a profile', async () => {
    const result = await albumArt({ profileId: null })({});
    expect(result.errorCode).toBe('PROFILE_REQUIRED');
    expect(mocks.generateBackgrounds).not.toHaveBeenCalled();
  });

  it('stops on a plan without album art', async () => {
    const result = await albumArt({ canGenerateAlbumArt: false })({});
    expect(result.errorCode).toBe('PLAN_UNAVAILABLE');
    expect(mocks.generateBackgrounds).not.toHaveBeenCalled();
  });

  it('reports the provider unavailable when the gateway is not set up', async () => {
    mocks.gatewayConfigured.mockReturnValue(false);
    const result = await albumArt()({ releaseTitle: 'Night Bus' });
    expect(result.errorCode).toBe('PROVIDER_UNAVAILABLE');
    expect(mocks.resolveTarget).not.toHaveBeenCalled();
  });

  it('asks for a release when none matches and none should be made', async () => {
    mocks.resolveTarget.mockResolvedValue({
      status: 'needs_target',
      suggestedReleases: [{ id: 'rel-1', title: 'Night Bus' }],
    });
    const result = await albumArt()({ releaseTitle: 'Unknown' });
    expect(result.state).toBe('needs_release_target');
    expect(result.suggestedReleases).toHaveLength(1);
    expect(mocks.generateBackgrounds).not.toHaveBeenCalled();
  });

  it('asks for a title before making art for a new release', async () => {
    const result = await albumArt()({ createRelease: true, releaseTitle: ' ' });
    expect(result.state).toBe('needs_release_target');
    expect(result.suggestedReleases).toEqual([]);
    expect(mocks.generateBackgrounds).not.toHaveBeenCalled();
  });

  it('honors the burst and daily limits', async () => {
    mocks.burstLimit.mockResolvedValueOnce({ success: false });
    const burst = await albumArt()({ releaseTitle: 'Night Bus' });
    expect(burst).toMatchObject({ errorCode: 'RATE_LIMITED', retryable: true });

    mocks.dailyLimit.mockResolvedValueOnce({
      success: false,
      reason: 'Daily limit reached.',
    });
    const daily = await albumArt()({ releaseTitle: 'Night Bus' });
    expect(daily).toMatchObject({
      errorCode: 'RATE_LIMITED',
      error: 'Daily limit reached.',
    });
    expect(mocks.generateBackgrounds).not.toHaveBeenCalled();
  });

  it('makes three candidates and saves the manifest for the release', async () => {
    mocks.generateBackgrounds.mockResolvedValue({
      images: [1, 2, 3, 4].map(n => Buffer.from(String(n))),
      model: 'stub-model',
    });
    const result = await albumArt()({
      releaseTitle: 'Night Bus',
      styleId: 'chrome_noir',
    });
    expect(result).toMatchObject({
      success: true,
      state: 'generated',
      releaseId: 'rel-1',
      releaseTitle: 'Night Bus',
      hasExistingArtwork: true,
    });
    expect(result.candidates).toHaveLength(3);
    expect(mocks.render).toHaveBeenCalledTimes(3);
    expect(mocks.uploadManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        releaseId: 'rel-1',
        styleId: 'chrome_noir',
        candidates: result.candidates,
      })
    );
  });

  it('makes art for a new release title with no release id', async () => {
    mocks.resolveTarget.mockResolvedValue({
      status: 'needs_target',
      suggestedReleases: [],
    });
    const result = await albumArt()({
      createRelease: true,
      releaseTitle: 'Fresh One',
    });
    expect(result).toMatchObject({
      success: true,
      releaseId: null,
      releaseTitle: 'Fresh One',
      hasExistingArtwork: false,
    });
  });

  it('treats a gateway that drops mid-call as unavailable, without alerting', async () => {
    mocks.generateBackgrounds.mockRejectedValue(
      new AlbumArtGatewayUnconfiguredError('gone')
    );
    const result = await albumArt()({ releaseTitle: 'Night Bus' });
    expect(result.errorCode).toBe('PROVIDER_UNAVAILABLE');
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('reports other failures and lets the artist retry', async () => {
    mocks.uploadManifest.mockRejectedValue(new Error('blob down'));
    const result = await albumArt()({ releaseTitle: 'Night Bus' });
    expect(result).toMatchObject({
      success: false,
      retryable: true,
      errorCode: 'TOOL_EXECUTION_FAILED',
    });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });
});
