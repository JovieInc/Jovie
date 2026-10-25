import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
    updates: [] as Array<Record<string, unknown>>,
  };
  const selectChain = () => {
    const rows = state.selectRows.shift() ?? [];
    const terminal = { limit: vi.fn().mockResolvedValue(rows) };
    const where = vi.fn(() => terminal);
    return {
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({ where })),
        where,
      })),
    };
  };
  const update = vi.fn(() => ({
    set: vi.fn((args: Record<string, unknown>) => {
      state.updates.push(args);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));
  return {
    state,
    select: vi.fn(selectChain),
    update,
    recordStage: vi.fn().mockResolvedValue(true),
    submitCard: vi.fn().mockResolvedValue({ outcome: 'created' }),
    decideCard: vi.fn().mockResolvedValue({ outcome: 'decided' }),
    refund: vi.fn(),
    lockIdentity: vi.fn().mockResolvedValue(undefined),
    holders: [] as unknown[],
    syncReleases: vi.fn().mockResolvedValue({ success: true }),
    invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
    captureError: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update },
}));
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', email: 'email', stripeSubscriptionId: 'sub' },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    settings: 'settings',
    usernameNormalized: 'usernameNormalized',
  },
}));
vi.mock('@/constants/domains', () => ({ BASE_URL: 'https://jov.ie' }));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mocks.recordStage,
}));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mocks.invalidateProfileCache,
}));
vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: mocks.syncReleases,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: (op: (tx: unknown) => Promise<unknown>) =>
    op({
      update: mocks.update,
      select: () => ({
        from: () => ({ where: () => Promise.resolve(mocks.holders) }),
      }),
    }),
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: mocks.submitCard,
  decideSummerCard: mocks.decideCard,
}));
vi.mock('@/lib/profile/spotify-profile-identity', () => {
  class SpotifyProfileIdentityConflictError extends Error {}
  return {
    lockSpotifyProfileIdentity: mocks.lockIdentity,
    SpotifyProfileIdentityConflictError,
  };
});
vi.mock('@/lib/stripe/claim-rejection-refund', () => ({
  refundFirstMonthAndCancel: mocks.refund,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));

import {
  buildClaimVerificationRequest,
  markClaimVerificationPaid,
} from './claim-verification';
import {
  decideClaimVerification,
  fileClaimVerificationCard,
} from './claim-verification-review.server';

const PROFILE = '11111111-2222-4333-8444-555555555555';
const now = new Date('2026-10-22T09:00:00.000Z');
const pending = markClaimVerificationPaid(
  buildClaimVerificationRequest({
    spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
    artistName: 'Famous Artist',
    reach: 2_400_000,
    paid: false,
    now: new Date('2026-10-21T08:00:00.000Z'),
  }),
  new Date('2026-10-21T08:05:00.000Z'),
  'journey-1'
)!;

function queueProfile(
  record: unknown,
  subscriptionId: string | null = 'sub_1'
) {
  mocks.state.selectRows.push([
    {
      handle: 'requester',
      settings: { keep: true, claimVerification: record },
      userId: 'u1',
      subscriptionId,
    },
  ]);
}

describe('claim verification review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.selectRows = [];
    mocks.state.updates = [];
    mocks.refund.mockResolvedValue({
      refundId: 're_1',
      amount: 1200,
      canceled: true,
    });
    mocks.holders = [];
  });

  it('files a deterministic decision card in the Ovie inbox', async () => {
    await fileClaimVerificationCard({
      profileId: PROFILE,
      handle: 'requester',
      record: pending,
    });
    expect(mocks.submitCard).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `claim-verification_${PROFILE}`,
        kind: 'decision',
        product: 'jov',
        title: 'Verify artist claim: Famous Artist',
        evidence: [
          'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
          'https://jov.ie/requester',
        ],
      })
    );
    const body = mocks.submitCard.mock.calls[0]?.[0]?.body as string;
    expect(body).toContain('2,400,000 Spotify followers');
  });

  it('approve links the artist under the identity lock and records the stage', async () => {
    queueProfile(pending);
    const result = await decideClaimVerification({
      profileId: PROFILE,
      decision: 'approve',
      decidedBy: 'tim@jov.ie',
      now,
    });

    expect(result).toMatchObject({
      outcome: 'decided',
      record: { status: 'verified', decidedBy: 'tim@jov.ie' },
    });
    expect(mocks.lockIdentity).toHaveBeenCalledWith(
      expect.anything(),
      '06HL4z0CvFAxyc27GXpf02'
    );
    expect(mocks.state.updates[0]).toMatchObject({
      spotifyId: '06HL4z0CvFAxyc27GXpf02',
      spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
      settings: expect.objectContaining({
        keep: true,
        spotifyArtistName: 'Famous Artist',
        claimVerification: expect.objectContaining({ status: 'verified' }),
      }),
    });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.recordStage).toHaveBeenCalledWith(
      'journey-1',
      'claim-verified',
      now
    );
    expect(mocks.decideCard).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approve' })
    );
    expect(mocks.syncReleases).toHaveBeenCalledWith(PROFILE, {
      includeTracks: true,
    });
  });

  it('approve takes the identity over from an unclaimed prebuilt profile', async () => {
    queueProfile(pending);
    mocks.holders = [
      {
        id: 'prebuilt-1',
        handle: 'famousartist',
        isClaimed: false,
        userId: null,
        settings: { source: 'ingest' },
      },
    ];

    const result = await decideClaimVerification({
      profileId: PROFILE,
      decision: 'approve',
      decidedBy: 'tim@jov.ie',
      now,
    });

    expect(result.outcome).toBe('decided');
    expect(mocks.state.updates[0]).toMatchObject({
      spotifyId: null,
      spotifyUrl: null,
      isPublic: false,
      settings: {
        source: 'ingest',
        supersededByVerifiedClaim: expect.objectContaining({
          toProfileId: PROFILE,
          spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
        }),
      },
    });
    expect(mocks.state.updates[1]).toMatchObject({
      spotifyId: '06HL4z0CvFAxyc27GXpf02',
    });
    expect(mocks.invalidateProfileCache).toHaveBeenCalledWith('famousartist');
    expect(mocks.invalidateProfileCache).toHaveBeenCalledWith('requester');
  });

  it('approve never takes over a claimed, held or reserved identity', async () => {
    for (const holder of [
      { isClaimed: true, userId: 'other', handle: 'realowner' },
      { isClaimed: false, userId: 'other', handle: 'midclaim' },
      { isClaimed: false, userId: null, handle: 'taylorswift' },
    ]) {
      queueProfile(pending);
      mocks.holders = [{ id: 'holder', settings: {}, ...holder }];
      await expect(
        decideClaimVerification({
          profileId: PROFILE,
          decision: 'approve',
          decidedBy: 'tim@jov.ie',
        })
      ).resolves.toEqual({ outcome: 'identity_conflict' });
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordStage).not.toHaveBeenCalled();
    expect(mocks.decideCard).not.toHaveBeenCalled();
  });

  it('reject refunds the first month, cancels, then records the decision', async () => {
    queueProfile(pending);
    const result = await decideClaimVerification({
      profileId: PROFILE,
      decision: 'reject',
      decidedBy: 'tim@jov.ie',
      reason: 'no ownership evidence',
      fromCard: true,
      now,
    });

    expect(mocks.refund).toHaveBeenCalledWith({
      subscriptionId: 'sub_1',
      idempotencyKey: `claim-verification-reject:${PROFILE}:sub_1`,
    });
    expect(result).toMatchObject({
      outcome: 'decided',
      record: {
        status: 'rejected',
        refundId: 're_1',
        decisionReason: 'no ownership evidence',
      },
    });
    expect(mocks.state.updates[0]?.spotifyId).toBeUndefined();
    expect(mocks.recordStage).toHaveBeenCalledWith(
      'journey-1',
      'claim-rejected',
      now
    );
    // The card route closes its own card.
    expect(mocks.decideCard).not.toHaveBeenCalled();
    expect(mocks.syncReleases).not.toHaveBeenCalled();
  });

  it('does not record a rejection when the refund fails', async () => {
    queueProfile(pending);
    mocks.refund.mockRejectedValueOnce(new Error('stripe down'));
    await expect(
      decideClaimVerification({
        profileId: PROFILE,
        decision: 'reject',
        decidedBy: 'tim@jov.ie',
      })
    ).rejects.toThrow('stripe down');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordStage).not.toHaveBeenCalled();
  });

  it('never re-runs side effects for a decided or unpaid request', async () => {
    for (const record of [
      { ...pending, status: 'rejected' },
      { ...pending, status: 'awaiting_payment' },
    ]) {
      queueProfile(record);
      const result = await decideClaimVerification({
        profileId: PROFILE,
        decision: 'reject',
        decidedBy: null,
      });
      expect(result.outcome).toBe('not_pending');
    }
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
