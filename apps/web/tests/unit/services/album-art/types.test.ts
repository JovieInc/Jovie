import { describe, expect, it } from 'vitest';
import type { AlbumArtGenerationSession } from '@/lib/db/schema/album-art';
import {
  mapGenerationSessionRecord,
  readReleaseAlbumArtMetadata,
} from '@/lib/services/album-art/types';

describe('readReleaseAlbumArtMetadata', () => {
  it('rejects malformed album art template objects', () => {
    expect(
      readReleaseAlbumArtMetadata({
        albumArtTemplate: {},
      })
    ).toEqual({
      albumArtTemplate: undefined,
      artworkOrigin: undefined,
      brandKitId: undefined,
      parsedVersionLabel: undefined,
    });
  });
});

describe('mapGenerationSessionRecord', () => {
  it('falls back safely for invalid persisted session values', () => {
    const session = {
      id: 'session-1',
      profileId: 'profile-1',
      releaseId: null,
      draftKey: null,
      mode: 'bad-mode',
      templateSourceType: 'bad-source',
      templateSourceId: null,
      status: 'bad-status',
      consumedRuns: 0,
      expiresAt: new Date('2026-04-03T00:00:00.000Z'),
      payloadJson: {},
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    } as AlbumArtGenerationSession;

    expect(mapGenerationSessionRecord(session)).toMatchObject({
      mode: 'base',
      templateSourceType: 'none',
      status: 'failed',
      payload: {
        title: '',
        artistName: '',
        prompt: '',
        mode: 'base',
        layoutPreset: 'v1-title-artist-version',
        options: [],
        sourceTemplateReleaseId: null,
        brandKitId: null,
      },
    });
  });
});
