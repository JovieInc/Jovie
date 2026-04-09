import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetReleaseById = vi.hoisted(() => vi.fn());
const mockGetTracksForReleaseWithProviders = vi.hoisted(() => vi.fn());

vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: mockGetReleaseById,
  getTracksForReleaseWithProviders: mockGetTracksForReleaseWithProviders,
}));

import { buildExtensionFillPreview } from '@/lib/extensions/fill-preview';

describe('buildExtensionFillPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTracksForReleaseWithProviders.mockResolvedValue({ tracks: [] });
  });

  it('falls back when the page variant is not supported yet', async () => {
    mockGetReleaseById.mockResolvedValue({
      id: 'release_1',
      creatorProfileId: 'profile_1',
      title: 'Night Drive',
      artistNames: ['Night Shift'],
      releaseDate: new Date('2026-02-20T00:00:00.000Z'),
      genres: ['Pop'],
      label: 'Jovie Records',
      upc: null,
    });

    const preview = await buildExtensionFillPreview(
      {
        workflowId: 'distrokid_release_form',
        entityId: 'release_1',
        entityKind: 'release',
        pageUrl: 'https://distrokid.com/new',
        pageVariant: null,
        availableTargets: [],
      },
      'profile_1'
    );

    expect(preview).toMatchObject({
      status: 'fallback',
      entityId: 'release_1',
    });
  });

  it('maps release-level fields and blocks missing required metadata', async () => {
    mockGetReleaseById.mockResolvedValue({
      id: 'release_1',
      creatorProfileId: 'profile_1',
      title: 'Night Drive',
      artistNames: ['Night Shift'],
      releaseDate: null,
      genres: ['Pop'],
      label: null,
      upc: null,
    });
    mockGetTracksForReleaseWithProviders.mockResolvedValue({
      tracks: [
        {
          title: 'Night Drive',
          isrc: 'USABC2600001',
          isExplicit: false,
        },
      ],
    });

    const preview = await buildExtensionFillPreview(
      {
        workflowId: 'distrokid_release_form',
        entityId: 'release_1',
        entityKind: 'release',
        pageUrl: 'https://distrokid.com/new',
        pageVariant: 'release_form_v1',
        availableTargets: [
          {
            targetId: 'release_title',
            targetKey: 'release_title',
            targetLabel: 'Release Title',
            currentValue: null,
          },
          {
            targetId: 'release_date',
            targetKey: 'release_date',
            targetLabel: 'Release Date',
            currentValue: null,
          },
          {
            targetId: 'track_title_0',
            targetKey: 'track_title',
            targetLabel: 'Track 1 Title',
            currentValue: null,
            groupIndex: 0,
          },
          {
            targetId: 'explicit_0',
            targetKey: 'explicit',
            targetLabel: 'Track 1 Explicit',
            currentValue: null,
            groupIndex: 0,
          },
        ],
      },
      'profile_1'
    );

    expect(preview).toMatchObject({
      status: 'blocked',
      blockers: [
        expect.objectContaining({
          label: 'Release Date',
        }),
      ],
      unsupportedTargets: [],
    });
    expect(preview?.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'release_title',
          status: 'ready',
          value: 'Night Drive',
        }),
        expect.objectContaining({
          targetId: 'release_date',
          status: 'blocked',
        }),
        expect.objectContaining({
          targetId: 'track_title_0',
          status: 'ready',
          value: 'Night Drive',
        }),
        expect.objectContaining({
          targetId: 'explicit_0',
          status: 'ready',
          value: 'Clean',
        }),
      ])
    );
  });
});
