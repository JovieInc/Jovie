import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { PostReleasePanel } from '@/app/app/(shell)/library/PostReleasePanel';
import { buildReleaseDownloadsRoute } from '@/constants/routes';
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
      title: 'Replace dead artist link',
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
    expect(screen.queryByText(/Email gate/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Update/u })
    ).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Open/u }));

    await waitFor(() => {
      expect(globalThis.open).toHaveBeenCalledWith(
        'https://genius.com/artists/tim-white',
        '_blank',
        'noopener,noreferrer'
      );
    });
    expect(feedback.success).toHaveBeenCalledWith(
      'Opened the surface. The repair stays open.'
    );
  });
});
