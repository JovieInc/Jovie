import { describe, expect, it } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { findingsForAsset } from '@/lib/library/post-release-scope';
import type { LibraryPresenceFindingView } from '@/lib/library/post-release-types';

const asset = {
  source: { provider: 'discography', canonicalId: 'release-1' },
  id: 'release-1',
  title: 'Never Say A Word',
  artist: 'Tim White',
  artworkUrl: null,
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 1,
  smartLinkPath: '/tim/never-say-a-word',
  releaseDate: '2026-08-28T00:00:00.000Z',
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'approved',
  profileVisibility: 'visible',
  lifecycleStatus: 'active',
  trackCount: 1,
  providerCount: 0,
  providers: [],
  hasLyrics: false,
  hasArtwork: false,
  hasVideoLinks: false,
  assetKinds: [],
  genres: [],
  spotifyPopularity: null,
  targetPlaylistCount: 0,
  isExplicit: false,
  label: null,
  upc: null,
  distributor: null,
  totalDurationMs: null,
} satisfies LibraryReleaseAsset;

function finding(
  overrides: Partial<LibraryPresenceFindingView> &
    Pick<LibraryPresenceFindingView, 'id' | 'kind' | 'title'>
): LibraryPresenceFindingView {
  return {
    subjectType: 'artist',
    subjectId: 'profile-1',
    scopeType: null,
    scopeId: null,
    category: null,
    issueType: 'dead_link',
    platform: 'Genius',
    currentUrl: 'https://genius.com/artists/tim-white',
    expectedUrl: 'https://jov.ie/tim',
    actionMode: 'direct_update',
    status: 'open',
    collisionDisposition: null,
    draftRequest: null,
    ...overrides,
  };
}

describe('findingsForAsset (JOV-6170 inspector scope integrity)', () => {
  it('never renders artist-scoped findings in the asset inspector, even when the subject matches', () => {
    const artistScoped = finding({
      id: 'f-artist-scoped',
      kind: 'repair',
      title: 'Add canonical Jovie profile',
      // Legacy seed shape: subject IS the asset id but scope is the artist.
      subjectType: 'artist',
      subjectId: 'release-1',
      scopeType: 'artist',
      scopeId: 'profile-1',
    });
    expect(findingsForAsset(asset, [artistScoped])).toEqual([]);
  });

  it('keeps legacy subject-type exclusion for artist-subject rows without an explicit scope', () => {
    const legacyArtist = finding({
      id: 'f-legacy-artist',
      kind: 'repair',
      title: 'Add canonical Jovie profile',
      subjectType: 'artist',
      subjectId: 'release-1',
      scopeType: null,
      scopeId: null,
    });
    expect(findingsForAsset(asset, [legacyArtist])).toEqual([]);
  });

  it('renders asset-scoped findings whose scope matches the asset', () => {
    const scoped = finding({
      id: 'f-scoped',
      kind: 'repair',
      title: 'Attach official links',
      subjectType: 'release',
      subjectId: 'release-1',
      scopeType: 'asset',
      scopeId: 'release-1',
    });
    expect(findingsForAsset(asset, [scoped])).toEqual([scoped]);
  });

  it('excludes asset-scoped findings belonging to a different asset', () => {
    const otherAsset = finding({
      id: 'f-other',
      kind: 'repair',
      title: 'Attach official links',
      subjectType: 'release',
      subjectId: 'release-other',
      scopeType: 'asset',
      scopeId: 'release-other',
    });
    expect(findingsForAsset(asset, [otherAsset])).toEqual([]);
  });

  it('falls back to subject matching for legacy rows without a scope', () => {
    const legacy = finding({
      id: 'f-legacy',
      kind: 'repair',
      title: 'Replace dead link',
      subjectType: 'release',
      subjectId: 'release-1',
      scopeType: null,
      scopeId: null,
    });
    expect(findingsForAsset(asset, [legacy])).toEqual([legacy]);
  });

  it('drops resolved and dismissed findings regardless of scope', () => {
    const rows = [
      finding({
        id: 'f-resolved',
        kind: 'repair',
        title: 'Resolved repair',
        subjectType: 'release',
        subjectId: 'release-1',
        scopeType: 'asset',
        scopeId: 'release-1',
        status: 'resolved',
      }),
      finding({
        id: 'f-dismissed',
        kind: 'repair',
        title: 'Dismissed repair',
        subjectType: 'release',
        subjectId: 'release-1',
        scopeType: 'asset',
        scopeId: 'release-1',
        status: 'dismissed',
      }),
    ];
    expect(findingsForAsset(asset, rows)).toEqual([]);
  });
});
