import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseContext } from '../types';

const mocks = vi.hoisted(() => ({
  resolveChatRelease: vi.fn(),
  updateOwnedReleaseGeneratedPitches: vi.fn(),
  buildPitchInput: vi.fn(),
  generateObject: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}));
vi.mock('../catalog-query', () => ({
  resolveChatRelease: mocks.resolveChatRelease,
}));
vi.mock('../release-writes', () => ({
  updateOwnedReleaseGeneratedPitches: mocks.updateOwnedReleaseGeneratedPitches,
}));
vi.mock('@/lib/services/pitch/build-pitch-input', () => ({
  buildPitchInput: mocks.buildPitchInput,
}));
vi.mock('@/lib/ai/sdk', () => ({
  gateway: vi.fn(() => 'stub-model'),
  generateObject: mocks.generateObject,
}));

const { createGenerateReleasePitchTool } = await import('./release-pitch');

type Execute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  error?: string;
  needsTarget?: boolean;
  target?: string;
  copyText?: string;
}>;

const PITCH_BODY =
  'Glass Weather is a slow-burning synth single about driving home after the last show. It sits next to late-night indie electronic playlists.';

function release(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return {
    id: 'rel-1',
    title: 'Glass Weather',
    releaseType: 'single',
    releaseDate: '2099-03-01T00:00:00.000Z',
    artworkUrl: null,
    spotifyPopularity: null,
    totalTracks: 1,
    canvasStatus: 'not_set',
    metadata: {},
    ...overrides,
  };
}

function pitch(
  releases: ReleaseContext[],
  catalog?: { status: 'ok' | 'unavailable'; total: number }
) {
  return createGenerateReleasePitchTool(
    'profile-1',
    { clerkUserId: 'user_1', conversationId: null },
    releases,
    undefined,
    catalog
  ).execute as unknown as Execute;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildPitchInput.mockResolvedValue({
    artist: {
      displayName: 'Pitch Artist',
      bio: null,
      genres: ['electronic'],
      location: null,
      activeSinceYear: null,
      spotifyFollowers: null,
      spotifyPopularity: null,
      careerHighlights: null,
      targetPlaylists: null,
    },
    release: {
      title: 'Glass Weather',
      releaseDate: null,
      releaseType: 'single',
      genres: null,
      totalTracks: 1,
      label: null,
      distributor: null,
    },
    tracks: [],
  });
  mocks.generateObject.mockResolvedValue({
    object: { subjectLine: null, body: PITCH_BODY },
    usage: { inputTokens: 10, outputTokens: 40 },
  });
  mocks.updateOwnedReleaseGeneratedPitches.mockResolvedValue(true);
});

describe('generateReleasePitch', () => {
  it('reports an unavailable catalog as a retry, not as no releases', async () => {
    const result = await pitch([], { status: 'unavailable', total: 0 })({
      target: 'playlist',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('temporarily unavailable');
  });

  it('asks the artist to add a release when there are none', async () => {
    const result = await pitch([], { status: 'ok', total: 0 })({
      target: 'playlist',
    });
    expect(result.error).toContain("don't have any releases");
  });

  it('lists the releases when the named one is not found', async () => {
    mocks.resolveChatRelease.mockResolvedValue(null);
    const named = await pitch([release()])({
      releaseTitle: 'Nope',
      target: 'playlist',
    });
    expect(named.error).toContain('Release "Nope" not found');
    expect(named.error).toContain('Glass Weather');
    const unnamed = await pitch([release()])({ target: 'playlist' });
    expect(unnamed.error).toContain('Which release should I pitch?');
  });

  it('asks where to pitch when no destination is given', async () => {
    mocks.resolveChatRelease.mockResolvedValue(release());
    const result = await pitch([release()])({ releaseTitle: 'Glass Weather' });
    expect(result.needsTarget).toBe(true);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('saves the pitch on the release and returns copy text', async () => {
    mocks.resolveChatRelease.mockResolvedValue(release());
    const result = await pitch([release()])({
      releaseTitle: 'Glass Weather',
      target: 'playlist',
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.copyText).toBe(PITCH_BODY);
    expect(mocks.updateOwnedReleaseGeneratedPitches).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseId: 'rel-1',
        creatorProfileId: 'profile-1',
        generatedPitches: expect.objectContaining({
          target: 'playlist',
          body: PITCH_BODY,
        }),
      })
    );
  });

  it('puts the subject line in the copy text when there is one', async () => {
    mocks.resolveChatRelease.mockResolvedValue(release());
    mocks.generateObject.mockResolvedValue({
      object: { subjectLine: 'Glass Weather for your list', body: PITCH_BODY },
      usage: { inputTokens: 10, outputTokens: 40 },
    });
    const result = await pitch([release()])({
      releaseTitle: 'Glass Weather',
      target: 'radio',
    });
    expect(result.copyText).toBe(
      `Subject: Glass Weather for your list\n\n${PITCH_BODY}`
    );
  });

  it('fails when the release is not the artist’s to write', async () => {
    mocks.resolveChatRelease.mockResolvedValue(release());
    mocks.updateOwnedReleaseGeneratedPitches.mockResolvedValue(false);
    const result = await pitch([release()])({
      releaseTitle: 'Glass Weather',
      target: 'playlist',
    });
    expect(result).toEqual({
      success: false,
      error: 'Release not found or unauthorized',
    });
  });

  it('reports a failed generation without saving anything', async () => {
    mocks.resolveChatRelease.mockResolvedValue(release());
    mocks.generateObject.mockRejectedValue(new Error('model down'));
    const result = await pitch([release()])({
      releaseTitle: 'Glass Weather',
      target: 'playlist',
    });
    expect(result.error).toBe('Failed to generate pitches. Please try again.');
    expect(mocks.updateOwnedReleaseGeneratedPitches).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalled();
  });
});
