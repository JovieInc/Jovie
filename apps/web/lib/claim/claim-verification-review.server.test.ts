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
    assertIdentity: vi.fn().mockResolvedValue(undefined),
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
    op({ update: mocks.update }),
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: mocks.submitCard,
  decideSummerCard: mocks.decideCard,
}));
vi.mock('@/lib/profile/spotify-profile-identity', () => {
  class SpotifyProfileIdentityConflictError extends Error {}
  return {
    assertSpotifyProfileIdentityAvailable: mocks.assertIdentity,
    SpotifyProfileIdentityConflictError,
  };
});
vi.mock('@/lib/stripe/claim-rejection-refund', () => ({
  refundFirstMonthAndCancel: mocks.refund,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));

import { SpotifyProfileIdentityConflictError } from '@/lib/profile/spotify-profile-identity';
import {
  buildClaimVerificationRequest,
  markClaimVerificationPaid,
} from './claim-verification';
import {
  claimVerificationCardKey,
  decideClaimVerification,
  fileClaimVerificationCard,
  profileIdFromClaimCardKey,
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
    mocks.assertIdentity.mockResolvedValue(undefined);
  });

  it('round-trips card keys and ignores other cards', () => {
    expect(profileIdFromClaimCardKey(claimVerificationCardKey(PROFILE))).toBe(
      PROFILE
    );
    expect(profileIdFromClaimCardKey('summer-outbound-1')).toBeNull();
    expect(profileIdFromClaimCardKey('claim-verification_')).toBeNull();
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

  it('does not file a card before payment', async () => {
    await fileClaimVerificationCard({
      profileId: PROFILE,
      handle: 'requester',
      record: { ...pending, status: 'awaiting_payment' },
    });
    expect(mocks.submitCard).not.toHaveBeenCalled();
  });

  it('throws on a card conflict so the webhook retries', async () => {
    mocks.submitCard.mockResolvedValueOnce({ outcome: 'conflict' });
    await expect(
      fileClaimVerificationCard({
        profileId: PROFILE,
        handle: 'requester',
        record: pending,
      })
    ).rejects.toThrow('conflict');
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
    expect(mocks.assertIdentity).toHaveBeenCalledWith(
      expect.anything(),
      '06HL4z0CvFAxyc27GXpf02',
      PROFILE
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

  it('approve reports an identity conflict without changing the request', async () => {
    queueProfile(pending);
    mocks.assertIdentity.mockRejectedValueOnce(
      new SpotifyProfileIdentityConflictError()
    );
    await expect(
      decideClaimVerification({
        profileId: PROFILE,
        decision: 'approve',
        decidedBy: 'tim@jov.ie',
      })
    ).resolves.toEqual({ outcome: 'identity_conflict' });
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
      idempotencyKey: `claim-verification-reject:${PROFILE}`,
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

  it('refuses to reject without a subscription to refund', async () => {
    queueProfile(pending, null);
    await expect(
      decideClaimVerification({
        profileId: PROFILE,
        decision: 'reject',
        decidedBy: null,
      })
    ).resolves.toEqual({ outcome: 'no_subscription' });
    expect(mocks.refund).not.toHaveBeenCalled();
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

  it('returns not_found for a profile without a request', async () => {
    mocks.state.selectRows.push([]);
    await expect(
      decideClaimVerification({
        profileId: PROFILE,
        decision: 'approve',
        decidedBy: null,
      })
    ).resolves.toEqual({ outcome: 'not_found' });
  });
});
