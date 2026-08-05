import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  after: vi.fn(),
  captureWarning: vi.fn(() => Promise.resolve()),
  reconcileCreditedArtistProfiles: vi.fn(),
}));

vi.mock('next/server', () => ({ after: hoisted.after }));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: hoisted.captureWarning,
}));
vi.mock('@/lib/discography/collaborator-profile-reconciliation', () => ({
  reconcileCreditedArtistProfiles: hoisted.reconcileCreditedArtistProfiles,
}));

const { schedulePublicCollaboratorProfileReconciliation } = await import(
  '@/lib/profile/public-collaborator-reconciliation'
);

const unavailableCollaborator = {
  artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
  name: 'Austin Leeds',
  href: null,
  profileState: 'unavailable' as const,
  reconciliationEligible: true,
  role: 'featured_artist' as const,
  releaseId: 'release-1',
  releaseTitle: 'Take Me Over (Austin Leeds Remix)',
  releaseSlug: 'take-me-over-austin-leeds-remix',
  releaseDate: null,
  position: 1,
};

describe('public collaborator profile reconciliation scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.after.mockImplementation((callback: () => void) => {
      callback();
    });
  });

  it('does not queue work when the owner identity or collaborator profiles are complete', () => {
    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: null,
        collaborators: [unavailableCollaborator],
      })
    ).toBe(false);
    expect(hoisted.after).not.toHaveBeenCalled();

    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collaborators: [
          { ...unavailableCollaborator, profileState: 'claimed' },
        ],
      })
    ).toBe(false);
    expect(hoisted.after).not.toHaveBeenCalled();
  });

  it('queues exact-ID reconciliation after the render without blocking it', async () => {
    hoisted.reconcileCreditedArtistProfiles.mockResolvedValue({
      candidates: 1,
      created: 1,
      deferred: false,
      reused: 0,
      conflicted: 0,
      metadataUnavailable: 0,
    });

    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collaborators: [unavailableCollaborator],
      })
    ).toBe(true);

    await vi.waitFor(() => {
      expect(hoisted.reconcileCreditedArtistProfiles).toHaveBeenCalledWith(
        'owner-profile',
        'spotify-owner'
      );
    });
    expect(hoisted.captureWarning).not.toHaveBeenCalled();
  });

  it('reports failed closed reconciliation without failing the profile render', async () => {
    hoisted.reconcileCreditedArtistProfiles.mockRejectedValue(
      new Error('provider unavailable')
    );

    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collaborators: [unavailableCollaborator],
      })
    ).toBe(true);

    await vi.waitFor(() => {
      expect(hoisted.captureWarning).toHaveBeenCalledWith(
        'Public collaborator profile reconciliation failed',
        expect.any(Error),
        expect.objectContaining({
          creatorProfileId: 'owner-profile',
          route: '/[username]',
        })
      );
    });
  });

  it('silently falls back to the importer/backfill outside a request scope', () => {
    hoisted.after.mockImplementation(() => {
      throw new Error('after() was called outside a request scope');
    });

    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collaborators: [unavailableCollaborator],
      })
    ).toBe(false);
    expect(hoisted.reconcileCreditedArtistProfiles).not.toHaveBeenCalled();
    expect(hoisted.captureWarning).not.toHaveBeenCalled();
  });

  it('does not retry credits that have no exact provider identity', () => {
    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collaborators: [
          { ...unavailableCollaborator, reconciliationEligible: false },
        ],
      })
    ).toBe(false);
    expect(hoisted.after).not.toHaveBeenCalled();
  });

  it('never mutates data during the production build prerender', () => {
    const originalPhase = process.env.NEXT_PHASE;
    process.env.NEXT_PHASE = 'phase-production-build';

    expect(
      schedulePublicCollaboratorProfileReconciliation({
        creatorProfileId: 'owner-profile',
        ownerSpotifyId: 'spotify-owner',
        collaborators: [unavailableCollaborator],
      })
    ).toBe(false);
    expect(hoisted.after).not.toHaveBeenCalled();
    expect(hoisted.reconcileCreditedArtistProfiles).not.toHaveBeenCalled();

    if (originalPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = originalPhase;
  });
});
