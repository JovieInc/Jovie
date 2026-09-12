import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { PostReleasePanel } from '@/app/app/(shell)/library/PostReleasePanel';
import type {
  LibraryPostReleaseBundle,
  LibraryPresenceFindingView,
} from '@/lib/library/post-release-types';

const feedback = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({ toast: feedback }));

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

describe('PostReleasePanel inspector scope integrity (JOV-6170)', () => {
  it('does not render artist-scoped recommendations in the track inspector', () => {
    const bundle: LibraryPostReleaseBundle = {
      downloads: [],
      findings: [
        // Genius/Last.fm/MusicBrainz canonical-profile recs are artist-scoped.
        finding({
          id: 'f-genius',
          kind: 'repair',
          title: 'Add canonical Jovie profile on Genius',
          platform: 'Genius',
        }),
        finding({
          id: 'f-lastfm',
          kind: 'repair',
          title: 'Add canonical Jovie profile on Last.fm',
          platform: 'Last.fm',
        }),
        finding({
          id: 'f-musicbrainz',
          kind: 'repair',
          title: 'Add canonical Jovie profile on MusicBrainz',
          platform: 'MusicBrainz',
        }),
        // Asset-scoped repairs still render.
        finding({
          id: 'f-asset',
          kind: 'repair',
          title: 'Attach official links',
          subjectType: 'release',
          subjectId: 'release-1',
          scopeType: 'asset',
          scopeId: 'release-1',
        }),
      ],
      rightsholders: [],
      stats: [],
    };

    render(
      <TooltipProvider>
        <PostReleasePanel
          asset={asset}
          creatorProfileId='profile-1'
          bundle={bundle}
          disabled={false}
        />
      </TooltipProvider>
    );

    // Artist-scoped recs are absent, even though the Presence count section
    // still counts only what renders — 0 open here for the scoped recs.
    expect(
      screen.queryByText('Add canonical Jovie profile on Genius')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Add canonical Jovie profile on Last.fm')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Add canonical Jovie profile on MusicBrainz')
    ).not.toBeInTheDocument();
    // Asset-scoped repair renders normally.
    expect(screen.getByText('Attach official links')).toBeInTheDocument();
    expect(screen.getByTestId('library-post-release-panel')).toBeTruthy();
  });
});
