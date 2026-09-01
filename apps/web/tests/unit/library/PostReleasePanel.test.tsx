import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { PostReleasePanel } from '@/app/app/(shell)/library/PostReleasePanel';
import { buildReleaseDownloadsRoute } from '@/constants/routes';
import type { LibraryPostReleaseBundle } from '@/lib/library/post-release-types';

const feedback = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({ toast: feedback }));

const asset: LibraryReleaseAsset = {
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
};

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
    {
      id: 'finding-repair',
      subjectType: 'artist',
      subjectId: 'profile-1',
      kind: 'repair',
      issueType: 'dead_link',
      platform: 'Genius',
      title: 'Replace dead artist link',
      currentUrl: 'https://genius.com/artists/tim-white',
      expectedUrl: 'https://jov.ie/tim',
      actionMode: 'direct_update',
      status: 'open',
      collisionDisposition: null,
      draftRequest: null,
    },
    {
      id: 'finding-collision',
      subjectType: 'artist',
      subjectId: 'profile-1',
      kind: 'collision',
      issueType: 'wrong_artist',
      platform: 'Open web',
      title: 'Other Tim White',
      currentUrl: null,
      expectedUrl: null,
      actionMode: 'filter_only',
      status: 'open',
      collisionDisposition: 'unreviewed',
      draftRequest: null,
    },
    {
      id: 'finding-draft',
      subjectType: 'release',
      subjectId: 'release-1',
      kind: 'repair',
      issueType: 'wrong_url',
      platform: 'Apple Music',
      title: 'Update Apple Music profile link',
      currentUrl: null,
      expectedUrl: 'https://music.apple.com/us/artist/tim-white',
      actionMode: 'draft_request',
      status: 'drafted',
      collisionDisposition: null,
      draftRequest: 'Please update this Apple Music profile link.',
    },
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
};

function renderPanel() {
  return render(
    <TooltipProvider>
      <PostReleasePanel
        asset={asset}
        creatorProfileId='profile-1'
        bundle={bundle}
        disabled={false}
      />
    </TooltipProvider>
  );
}

describe('PostReleasePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('shows a truthful post-release card without licensing or invented stats', () => {
    renderPanel();

    expect(screen.getByText('1 attested file live')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      buildReleaseDownloadsRoute('release-1')
    );
    expect(screen.getAllByText('Not connected')).toHaveLength(2);
    expect(screen.getByText('Observed')).toBeInTheDocument();
    expect(screen.getByText('2 open · 1 drafted')).toBeInTheDocument();
    expect(
      screen.getByText(/public composition observations, not proof/u)
    ).toBeInTheDocument();
    expect(screen.queryByText(/license/u)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/streams|revenue|earnings/u)
    ).not.toBeInTheDocument();
  });

  it('opens a claimable surface but keeps the repair open', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ finding: bundle.findings[0] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Update/u }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/library/post-release',
        expect.objectContaining({ method: 'PATCH' })
      );
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

  it('persists not-this-artist as a first-class collision outcome', async () => {
    const collision = {
      ...bundle.findings[1],
      status: 'dismissed' as const,
      collisionDisposition: 'not_this_artist' as const,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ finding: collision }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /not this artist/i }));

    await waitFor(() => {
      expect(screen.queryByText('Other Tim White')).not.toBeInTheDocument();
    });
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      action: 'not_this_artist',
      findingId: 'finding-collision',
    });
  });
});
