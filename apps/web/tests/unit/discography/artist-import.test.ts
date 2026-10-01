import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureWarning: vi.fn(),
  deleteRecordingArtistRole: vi.fn().mockResolvedValue(undefined),
  deleteRecordingArtists: vi.fn().mockResolvedValue(undefined),
  findOrCreateArtist: vi.fn(),
  getRecordingArtistCreditEdges: vi.fn(),
  upsertRecordingArtist: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mocks.captureWarning,
}));
vi.mock('@/lib/discography/artist-queries/artist-crud', () => ({
  findOrCreateArtist: mocks.findOrCreateArtist,
}));
vi.mock('@/lib/discography/artist-queries/recording-artists', () => ({
  deleteRecordingArtistRole: mocks.deleteRecordingArtistRole,
  deleteRecordingArtists: mocks.deleteRecordingArtists,
  getRecordingArtistCreditEdges: mocks.getRecordingArtistCreditEdges,
  upsertRecordingArtist: mocks.upsertRecordingArtist,
}));
vi.mock('@/lib/discography/artist-queries/release-artists', () => ({
  deleteReleaseArtists: vi.fn(),
  upsertReleaseArtist: vi.fn(),
}));
vi.mock('@/lib/discography/artist-queries/track-artists', () => ({
  deleteTrackArtists: vi.fn(),
  upsertTrackArtist: vi.fn(),
}));

import { processRecordingArtistCredits } from '@/lib/discography/artist-queries/artist-import';

describe('processRecordingArtistCredits provider reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOrCreateArtist.mockResolvedValue({
      id: 'artist-austin',
      name: 'Austin Leeds',
    });
    mocks.upsertRecordingArtist.mockImplementation(async input => ({
      id: 'edge-1',
      ...input,
    }));
  });

  it('moves a stale main edge to the explicit role without losing provider provenance', async () => {
    mocks.getRecordingArtistCreditEdges.mockResolvedValue([
      {
        role: 'main_artist',
        metadata: {
          spotify: {
            sourceEntityId: 'spotify-track',
            observedRole: 'main_artist',
          },
        },
      },
    ]);

    await processRecordingArtistCredits(
      'recording-1',
      [
        {
          name: 'Austin Leeds',
          role: 'remixer',
          joinPhrase: ' remixed by ',
          position: 2,
          isPrimary: false,
          observedRole: 'main_artist',
          roleSource: 'title',
        },
      ],
      {
        deleteExisting: false,
        sourceType: 'ingested',
        provider: 'apple_music',
        sourceEntityId: 'apple-track',
      }
    );

    expect(mocks.upsertRecordingArtist).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'remixer',
        isPrimary: false,
        metadata: {
          spotify: {
            sourceEntityId: 'spotify-track',
            observedRole: 'main_artist',
          },
          apple_music: expect.objectContaining({
            sourceEntityId: 'apple-track',
            observedRole: 'main_artist',
            canonicalRole: 'remixer',
            authority: 'explicit_title',
            conflict: 'role_mismatch',
          }),
        },
      }),
      expect.anything()
    );
    expect(mocks.deleteRecordingArtistRole).toHaveBeenCalledWith(
      'recording-1',
      'artist-austin',
      'main_artist',
      expect.anything()
    );
    expect(
      mocks.upsertRecordingArtist.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.deleteRecordingArtistRole.mock.invocationCallOrder[0] ?? 0
    );
    expect(mocks.captureWarning).toHaveBeenCalledWith(
      'Artist credit provider role mismatch',
      expect.objectContaining({ canonicalRole: 'remixer' })
    );
  });

  it('does not let a later generic provider presentation re-promote an explicit role', async () => {
    mocks.getRecordingArtistCreditEdges.mockResolvedValue([
      {
        role: 'remixer',
        metadata: {
          apple_music: { authority: 'explicit_title' },
        },
      },
    ]);

    await processRecordingArtistCredits(
      'recording-1',
      [
        {
          name: 'Austin Leeds',
          role: 'main_artist',
          joinPhrase: ' & ',
          position: 1,
          isPrimary: true,
          spotifyId: 'spotify-austin',
          roleSource: 'provider_artist',
        },
      ],
      {
        deleteExisting: false,
        sourceType: 'ingested',
        provider: 'spotify',
        sourceEntityId: 'spotify-track',
      }
    );

    expect(mocks.upsertRecordingArtist).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'remixer',
        isPrimary: false,
        metadata: expect.objectContaining({
          spotify: expect.objectContaining({
            observedRole: 'main_artist',
            canonicalRole: 'remixer',
            conflict: 'role_mismatch',
          }),
        }),
      }),
      expect.anything()
    );
    expect(mocks.deleteRecordingArtistRole).not.toHaveBeenCalled();
  });
});
