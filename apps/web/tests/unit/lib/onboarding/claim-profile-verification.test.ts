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
const {
  mockDbSelect,
  mockIdentityConflict,
  mockLockIdentity,
  mockDbUpdate,
  mockDbInsert,
  mockReserveOnboardingHandle,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockIdentityConflict: vi.fn(),
  mockLockIdentity: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockReserveOnboardingHandle: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/claim/claim-verification.server', () => ({
  getClaimVerificationReach: claimVerification.getReach,
  requestClaimVerification: claimVerification.request,
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
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));
vi.mock('@/lib/dsp-enrichment/providers/musicfetch', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/dsp-enrichment/providers/musicfetch')
  >()),
  fetchArtistBySpotifyUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/onboarding/reserved-handle', () => ({
  reserveOnboardingHandle: mockReserveOnboardingHandle,
}));

import { materializeClaimedOnboardingProfile } from '@/lib/onboarding/claim-profile';
import { SpotifyProfileIdentityConflictError } from '@/lib/profile/spotify-profile-identity';

function buildOnboardingToolRows(options: {
  artist: {
    id: string;
    name: string;
    url: string;
    followers: number;
    popularity?: number;
  };
  catalogPreview?: {
    total: number;
    releases: Array<{
      id: string;
      title: string;
      releaseType: 'album' | 'single' | 'ep' | 'compilation';
      releaseDate: string | null;
      artworkUrl: string | null;
      spotifyUrl: string;
    }>;
  };
  handle?: string | null;
}) {
  const toolCalls: Array<Record<string, unknown>> = [
    {
      schemaVersion: 2,
      toolCallId: `confirm-${options.artist.id}`,
      toolName: 'confirmSpotifyArtist',
      state: 'succeeded',
      uiHint: 'artifact',
      output: {
        action: 'spotify_artist_confirmed',
        spotifyArtistId: options.artist.id,
        artist: {
          id: options.artist.id,
          name: options.artist.name,
          url: options.artist.url,
          imageUrl: null,
          followers: options.artist.followers,
          popularity: options.artist.popularity ?? 25,
          genres: [],
        },
        ...(options.catalogPreview
          ? { catalogPreview: options.catalogPreview }
          : {}),
      },
    },
  ];
  if (options.handle) {
    toolCalls.push({
      schemaVersion: 2,
      toolCallId: `handle-${options.handle}`,
      toolName: 'checkHandle',
      state: 'succeeded',
      uiHint: 'artifact',
      output: { action: 'handle_confirmed', handle: options.handle },
    });
  }
  return [{ role: 'assistant', toolCalls }];
}

function setupQueries(messageRows: Array<Record<string, unknown>>) {
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
        orderBy: vi.fn().mockResolvedValue(messageRows),
      }),
    }),
  });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
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
    .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

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
    .mockReturnValue({
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
    setupQueries(
      buildOnboardingToolRows({
        artist: {
          id: 'spotify_held',
          name: 'Signal Artist',
          url: 'https://open.spotify.com/artist/spotify_held',
          followers: 3_200,
        },
        handle: null,
      })
    );
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
    setupQueries(
      buildOnboardingToolRows({
        artist: {
          id: 'spotify_small',
          name: 'Small Indie Artist',
          url: 'https://open.spotify.com/artist/spotify_small',
          followers: 620,
          popularity: 18,
        },
        catalogPreview,
        handle: 'smallindie',
      })
    );
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

    setupQueries(
      buildOnboardingToolRows({
        artist: {
          id: 'spotify_famous',
          name: 'Famous Artist',
          url: 'https://open.spotify.com/artist/spotify_famous',
          followers: 90_000,
          popularity: 80,
        },
        handle: 'famoushandle',
      })
    );
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
    setupQueries(
      buildOnboardingToolRows({
        artist: {
          id: 'spotify_taken',
          name: 'Taken Artist',
          url: 'https://open.spotify.com/artist/spotify_taken',
          followers: 120_000,
          popularity: 70,
        },
        handle: 'takenartist',
      })
    );
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
