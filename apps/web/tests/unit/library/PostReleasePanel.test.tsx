import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { PostReleasePanel } from '@/app/app/(shell)/library/PostReleasePanel';
import { buildReleaseDownloadsRoute } from '@/constants/routes';
import { ARTIST_PRESENCE_LEAK_RECOMMENDATIONS } from '@/lib/library/fixtures/inspector-scope-artist-leak';
import {
  type LibraryPostReleaseBundle,
  type LibraryPresenceFindingView,
  withInspectorScope,
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
  return withInspectorScope({
    subjectType: 'release',
    subjectId: 'release-1',
    issueType: 'dead_link',
    platform: 'Genius',
    currentUrl: 'https://genius.com/songs/never-say-a-word',
    expectedUrl: 'https://jov.ie/tim/never-say-a-word',
    actionMode: 'direct_update',
    status: 'open',
    collisionDisposition: null,
    draftRequest: null,
    ...overrides,
  });
}

const bundle: LibraryPostReleaseBundle = {
  downloads: [
    {
      id: 'download-1',
      releaseId: 'release-1',
      title: 'Radio edit',
      fileName: 'radio-edit.wav',
    },
  ],
  findings: [
    finding({
      id: 'finding-repair',
      kind: 'repair',
      title: 'Replace dead release link',
    }),
  ],
  rightsholders: [
    {
      id: 'evidence-1',
      subjectType: 'release',
      subjectId: 'release-1',
      partyName: 'Tim White',
      role: 'writer',
      domain: 'composition',
      evidenceClass: 'observed',
      source: 'songview',
      shareBps: null,
    },
  ],
  stats: [],
};

describe('PostReleasePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('shows a truthful post-release card without licensing or invented stats', () => {
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

    expect(screen.getByText('1 attested file live')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      buildReleaseDownloadsRoute('release-1')
    );
    expect(screen.getAllByText('Not connected')).toHaveLength(2);
    expect(screen.queryByText(/license/u)).not.toBeInTheDocument();
  });

  it('opens a claimable surface but keeps the repair open', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ finding: bundle.findings[0] }), {
        status: 200,
      })
    );
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

    fireEvent.click(screen.getByRole('button', { name: /Update/u }));

    await waitFor(() => {
      expect(globalThis.open).toHaveBeenCalledWith(
        'https://genius.com/songs/never-say-a-word',
        '_blank',
        'noopener,noreferrer'
      );
    });
    expect(feedback.success).toHaveBeenCalledWith(
      'Opened the surface. The repair stays open.'
    );
  });

  it('does not render artist Presence recommendations in a release inspector', () => {
    const artistDump = ARTIST_PRESENCE_LEAK_RECOMMENDATIONS.map((item, index) =>
      withInspectorScope({
        id: `artist-leak-${index}`,
        kind: 'repair',
        title: item.title,
        subjectType: 'artist',
        subjectId: item.scopeId,
        issueType: 'missing_jovie_link',
        platform: item.platform,
        currentUrl: null,
        expectedUrl: 'https://jov.ie/tim',
        actionMode: 'direct_update',
        status: 'open',
        collisionDisposition: null,
        draftRequest: null,
      })
    );

    render(
      <TooltipProvider>
        <PostReleasePanel
          asset={asset}
          creatorProfileId='profile-1'
          bundle={{ ...bundle, findings: artistDump }}
          disabled={false}
        />
      </TooltipProvider>
    );

    expect(
      screen.queryByText('Add a canonical Jovie link on Last.fm')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Add a canonical Jovie link on Genius')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Add a canonical Jovie link on MusicBrainz')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'No open repairs, collisions, or placement opportunities.'
      )
    ).toBeInTheDocument();
  });

  it('does not render artist Presence recommendations in a track inspector', () => {
    const trackAsset = {
      ...asset,
      id: 'track-1',
      itemKind: 'audio',
      linkedReleaseId: 'release-1',
    } satisfies LibraryReleaseAsset;

    render(
      <TooltipProvider>
        <PostReleasePanel
          asset={trackAsset}
          creatorProfileId='profile-1'
          bundle={{
            ...bundle,
            findings: [
              withInspectorScope({
                id: 'artist-lastfm',
                kind: 'repair',
                title: 'Add a canonical Jovie link on Last.fm',
                subjectType: 'artist',
                subjectId: 'profile-1',
                issueType: 'missing_jovie_link',
                platform: 'Last.fm',
                currentUrl: null,
                expectedUrl: 'https://jov.ie/tim',
                actionMode: 'direct_update',
                status: 'open',
                collisionDisposition: null,
                draftRequest: null,
              }),
            ],
          }}
          disabled={false}
        />
      </TooltipProvider>
    );

    expect(
      screen.queryByText('Add a canonical Jovie link on Last.fm')
    ).not.toBeInTheDocument();
  });

  it('renders a tiny contextual blocker when it directly blocks the selected object', () => {
    render(
      <TooltipProvider>
        <PostReleasePanel
          asset={asset}
          creatorProfileId='profile-1'
          bundle={{
            ...bundle,
            findings: [
              withInspectorScope({
                id: 'spotify-blocker',
                kind: 'repair',
                title: 'Spotify connection required to update this release',
                subjectType: 'artist',
                subjectId: 'profile-1',
                issueType: 'dead_link',
                platform: 'Spotify',
                currentUrl: null,
                expectedUrl: null,
                actionMode: 'direct_update',
                status: 'open',
                collisionDisposition: null,
                draftRequest: null,
                category: 'connection',
                primitive: 'blocker',
                blocksSelectedObject: true,
              }),
            ],
          }}
          disabled={false}
        />
      </TooltipProvider>
    );

    expect(
      screen.getByText('Spotify connection required to update this release')
    ).toBeInTheDocument();
  });
});
