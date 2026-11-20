import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isProofBlockingPublication,
  readClaimVerification,
} from '@/lib/claim/claim-verification';

const claimVerification = vi.hoisted(() => ({
  getReach: vi.fn().mockResolvedValue(null),
  request: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/claim/claim-verification.server', () => ({
  getClaimVerificationReach: claimVerification.getReach,
  requestClaimVerification: claimVerification.request,
}));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: vi.fn(),
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  recordFunnelStep: vi.fn().mockResolvedValue(undefined),
}));

const {
  mockDbSelect,
  mockIdentityConflict,
  mockLockIdentity,
  mockDbUpdate,
  mockDbInsert,
  mockReserveOnboardingHandle,
  mockDeriveClaimedOnboardingStateFromMessageRows,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockIdentityConflict: vi.fn(),
  mockLockIdentity: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockReserveOnboardingHandle: vi.fn(),
  mockDeriveClaimedOnboardingStateFromMessageRows: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      execute: vi.fn().mockResolvedValue(undefined),
      select: (fields: unknown) => {
        if (fields)
          return {
            from: () => ({
              where: () => ({ limit: async () => [{ id: 'user_1' }] }),
            }),
          };
        return mockDbSelect();
      },
      update: mockDbUpdate,
      insert: mockDbInsert,
    }),
}));

vi.mock('@/lib/profile/spotify-profile-identity', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/profile/spotify-profile-identity')
  >()),
  assertSpotifyProfileIdentityAvailable: mockIdentityConflict,
  lockSpotifyProfileIdentity: mockLockIdentity,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));
vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  fetchArtistBySpotifyUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/onboarding/claimed-state', () => ({
  deriveClaimedOnboardingStateFromMessageRows:
    mockDeriveClaimedOnboardingStateFromMessageRows,
}));
vi.mock('@/lib/onboarding/reserved-handle', () => ({
  reserveOnboardingHandle: mockReserveOnboardingHandle,
}));
vi.mock('@/lib/onboarding/catalog-import.server', () => ({
  scheduleOnboardingCatalogImport: vi.fn(() => true),
}));
vi.mock('@/lib/tasks/chat-work-record', () => ({
  ensureChatWorkRecord: vi.fn().mockResolvedValue(null),
}));

import { materializeClaimedOnboardingProfile } from '@/lib/onboarding/claim-profile';
import { SpotifyProfileIdentityConflictError } from '@/lib/profile/spotify-profile-identity';

function setupQueries() {
  const convLimit = vi
    .fn()
    .mockResolvedValue([{ id: 'conv_1', userId: 'user_1' }]);
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: convLimit }),
    }),
  });
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([{ toolCalls: [] }]),
      }),
    }),
  });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ for: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
  });
}

function setupWrites(profileId = 'profile_held') {
  const insertProfileValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: profileId }]),
  });
  mockDbInsert
    .mockReturnValueOnce({ values: insertProfileValues })
    .mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    })
    .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });

  mockDbUpdate
    .mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ email: 'artist@example.com' }]),
        }),
      }),
    })
    .mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

  return insertProfileValues;
}

describe('materializeClaimedOnboardingProfile — held artist handle fallback & atomic verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveOnboardingHandle.mockResolvedValue('signalartist');
  });

  it('materializes a held artist when state.handle is null and writes claimVerification atomically', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: {
        id: 'spotify_held',
        name: 'Signal Artist',
        url: 'https://open.spotify.com/artist/spotify_held',
        imageUrl: null,
        followers: 3_200,
        popularity: 25,
        genres: [],
      },
      handle: null,
      socialLinks: [],
      interviewSignals: [],
    });
    setupQueries();
    const insertProfileValues = setupWrites();

    const result = await materializeClaimedOnboardingProfile({
      userId: 'user_1',
      conversationId: 'conv_1',
      ipAddress: null,
      userAgent: null,
      visibility: 'unproven',
    });

    expect(result).toEqual({
      profileId: 'profile_held',
      handle: 'signalartist',
      status: 'created',
    });
    expect(mockReserveOnboardingHandle).toHaveBeenCalledWith(
      'Signal Artist',
      'user_1'
    );
    expect(mockLockIdentity).toHaveBeenCalledWith(
      expect.anything(),
      'spotify_held'
    );
    expect(mockIdentityConflict).toHaveBeenCalledWith(
      expect.anything(),
      'spotify_held',
      null
    );

    const inserted = insertProfileValues.mock.calls[0]?.[0] as {
      displayName: string;
      isPublic: boolean;
      creatorType: string;
      settings: Record<string, unknown>;
    };
    expect(inserted.displayName).toBe('Signal Artist');
    expect(inserted.isPublic).toBe(false);
    expect(inserted.creatorType).toBe('artist');
    expect(isProofBlockingPublication(inserted.settings)).toBe(true);
    expect(readClaimVerification(inserted.settings)).toMatchObject({
      spotifyArtistId: 'spotify_held',
      artistName: 'Signal Artist',
      status: 'pending_verification',
      proofOnly: true,
    });
  });

  it('preserves catalogPreview on unproven <50k claims while keeping >=50k high-reach displayName neutral', async () => {
    const catalogPreview = {
      total: 2,
      releases: [
        {
          id: 'alb_1',
          title: 'First Light',
          releaseType: 'album' as const,
          releaseDate: '2025-11-01',
          artworkUrl: 'https://i.scdn.co/image/abc',
          spotifyUrl: 'https://open.spotify.com/album/alb1',
        },
      ],
    };
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValueOnce({
      artist: {
        id: 'spotify_small',
        name: 'Small Indie Artist',
        url: 'https://open.spotify.com/artist/spotify_small',
        imageUrl: null,
        followers: 620,
        popularity: 18,
        genres: [],
      },
      catalogPreview,
      handle: 'smallindie',
      socialLinks: [],
      interviewSignals: [],
    });
    setupQueries();
    const lowInsert = setupWrites('profile_low');
    await materializeClaimedOnboardingProfile({
      userId: 'user_1',
      conversationId: 'conv_1',
      ipAddress: null,
      userAgent: null,
      visibility: 'unproven',
    });
    const lowRow = lowInsert.mock.calls[0]?.[0] as {
      displayName: string;
      settings: { onboarding?: { catalogPreview?: unknown } };
    };
    expect(lowRow.displayName).toBe('Small Indie Artist');
    expect(lowRow.settings.onboarding?.catalogPreview).toEqual(catalogPreview);

    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValueOnce({
      artist: {
        id: 'spotify_famous',
        name: 'Famous Artist',
        url: 'https://open.spotify.com/artist/spotify_famous',
        imageUrl: null,
        followers: 90_000,
        popularity: 80,
        genres: [],
      },
      handle: 'famoushandle',
      socialLinks: [],
      interviewSignals: [],
    });
    setupQueries();
    const highInsert = setupWrites('profile_high');
    await materializeClaimedOnboardingProfile({
      userId: 'user_1',
      conversationId: 'conv_1',
      ipAddress: null,
      userAgent: null,
      visibility: 'unproven',
    });
    const highRow = highInsert.mock.calls[0]?.[0] as { displayName: string };
    expect(highRow.displayName).toBe('famoushandle');
  });

  it('forbids direct SQL catalog seeding in golden-path E2E specs so real import/preview paths are exercised', () => {
    const webRoot = resolve(__dirname, '../../../..');
    for (const rel of [
      'tests/e2e/golden-path.spec.ts',
      'tests/e2e/claim-checkout.spec.ts',
    ]) {
      const source = readFileSync(resolve(webRoot, rel), 'utf8');
      expect(
        source,
        `${rel} must not seed catalog releases via raw SQL`
      ).not.toMatch(
        /INSERT\s+INTO\s+(?:public\.)?(?:discog_releases|releases|release_links)\b/iu
      );
    }
  });

  it('rejects a held artist claim when Spotify identity already belongs to another profile', async () => {
    mockDeriveClaimedOnboardingStateFromMessageRows.mockReturnValue({
      artist: {
        id: 'spotify_taken',
        name: 'Taken Artist',
        url: 'https://open.spotify.com/artist/spotify_taken',
        imageUrl: null,
        followers: 120_000,
        popularity: 70,
        genres: [],
      },
      handle: 'takenartist',
      socialLinks: [],
      interviewSignals: [],
    });
    setupQueries();
    mockIdentityConflict.mockRejectedValueOnce(
      new SpotifyProfileIdentityConflictError()
    );

    await expect(
      materializeClaimedOnboardingProfile({
        userId: 'user_1',
        conversationId: 'conv_1',
        ipAddress: null,
        userAgent: null,
        visibility: 'unproven',
      })
    ).rejects.toBeInstanceOf(SpotifyProfileIdentityConflictError);
  });
});
