import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
    updates: [] as Array<Record<string, unknown>>,
  };
  const chain = () => {
    const rows = state.selectRows.shift() ?? [];
    const result = Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
    });
    return { from: vi.fn(() => ({ where: vi.fn(() => result) })) };
  };
  return {
    state,
    select: vi.fn(chain),
    update: vi.fn(() => ({
      set: vi.fn((args: Record<string, unknown>) => {
        state.updates.push(args);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
    recordStage: vi.fn().mockResolvedValue(true),
    getArtist: vi.fn(),
    isSpotifyAvailable: vi.fn().mockReturnValue(true),
    fileCard: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('./claim-verification-review.server', () => ({
  fileClaimVerificationCard: mocks.fileCard,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    settings: 'settings',
    spotifyId: 'spotifyId',
    spotifyFollowers: 'spotifyFollowers',
    displayName: 'displayName',
  },
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mocks.recordStage,
}));
vi.mock('@/lib/spotify', () => ({
  isSpotifyAvailable: mocks.isSpotifyAvailable,
  spotifyClient: { getArtist: mocks.getArtist },
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { buildClaimVerificationRequest } from './claim-verification';
import {
  getClaimVerificationReach,
  markClaimVerificationsPaid,
  requestClaimVerification,
} from './claim-verification.server';

const requestedAt = new Date('2026-10-21T08:00:00.000Z');
const paidAt = new Date('2026-10-21T08:05:00.000Z');
const awaiting = buildClaimVerificationRequest({
  spotifyArtistId: 'famous',
  artistName: 'Famous',
  reach: 2_400_000,
  paid: false,
  now: requestedAt,
});

describe('claim verification persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.selectRows = [];
    mocks.state.updates = [];
    mocks.isSpotifyAvailable.mockReturnValue(true);
  });

  it('uses a stored follower count before asking Spotify', async () => {
    mocks.state.selectRows = [[{ followers: 120_000, name: 'Famous' }]];
    await expect(getClaimVerificationReach('famous')).resolves.toBe(120_000);
    expect(mocks.getArtist).not.toHaveBeenCalled();
  });

  it('falls back to Spotify and lets low-reach artists through', async () => {
    mocks.state.selectRows = [[]];
    mocks.getArtist.mockResolvedValue({ followerCount: 900, name: 'Indie' });
    await expect(getClaimVerificationReach('indie')).resolves.toBeNull();
  });

  it('treats an unanswerable lookup as not high reach', async () => {
    mocks.state.selectRows = [[]];
    mocks.getArtist.mockRejectedValue(new Error('429'));
    await expect(getClaimVerificationReach('x')).resolves.toBeNull();
  });

  it('stores an awaiting_payment request without touching other settings', async () => {
    mocks.state.selectRows = [[{ settings: { keep: true } }]];
    const record = await requestClaimVerification({
      profileId: 'p1',
      spotifyArtistId: 'famous',
      artistName: 'Famous',
      reach: 2_400_000,
      paid: false,
      acquisitionId: 'journey-1',
      now: requestedAt,
    });
    expect(record.status).toBe('awaiting_payment');
    expect(mocks.state.updates[0]?.settings).toEqual({
      keep: true,
      claimVerification: { ...awaiting, acquisitionId: 'journey-1' },
    });
    expect(mocks.fileCard).not.toHaveBeenCalled();
    expect(mocks.recordStage).not.toHaveBeenCalled();
  });

  it('records the pending-verification stage when the requester already pays', async () => {
    mocks.state.selectRows = [[{ settings: {}, handle: 'requester' }]];
    await requestClaimVerification({
      profileId: 'p1',
      spotifyArtistId: 'famous',
      artistName: 'Famous',
      reach: 2_400_000,
      paid: true,
      acquisitionId: 'journey-1',
      now: requestedAt,
    });
    expect(mocks.recordStage).toHaveBeenCalledWith(
      'journey-1',
      'pending-verification',
      requestedAt
    );
    expect(mocks.fileCard).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p1', handle: 'requester' })
    );
  });

  it('transitions every awaiting request on payment and records the stage once', async () => {
    mocks.state.selectRows = [
      [
        {
          id: 'p1',
          handle: 'requester',
          settings: { claimVerification: awaiting },
        },
        { id: 'p2', handle: 'other', settings: {} },
      ],
    ];
    await expect(
      markClaimVerificationsPaid({
        appUserId: 'u1',
        paidAt,
        acquisitionId: 'journey-1',
      })
    ).resolves.toBe(1);
    expect(mocks.state.updates).toHaveLength(1);
    expect(mocks.state.updates[0]?.settings).toMatchObject({
      claimVerification: {
        status: 'pending_verification',
        paidAt: paidAt.toISOString(),
        requestedAt: requestedAt.toISOString(),
      },
    });
    expect(mocks.recordStage).toHaveBeenCalledWith(
      'journey-1',
      'pending-verification',
      paidAt
    );
    expect(mocks.fileCard).toHaveBeenCalledTimes(1);
    expect(mocks.fileCard).toHaveBeenCalledWith({
      profileId: 'p1',
      handle: 'requester',
      record: expect.objectContaining({
        status: 'pending_verification',
        acquisitionId: 'journey-1',
      }),
    });
  });

  it('replays the review card on a webhook retry without a second transition', async () => {
    const pending = {
      ...awaiting,
      status: 'pending_verification',
      paidAt: paidAt.toISOString(),
    };
    mocks.state.selectRows = [
      [
        {
          id: 'p1',
          handle: 'requester',
          settings: { claimVerification: pending },
        },
      ],
    ];
    await expect(
      markClaimVerificationsPaid({
        appUserId: 'u1',
        paidAt,
        acquisitionId: null,
      })
    ).resolves.toBe(0);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.fileCard).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p1', record: pending })
    );
  });

  it('is a no-op for buyers without an open request (the wedge path)', async () => {
    mocks.state.selectRows = [[{ id: 'p1', settings: {} }]];
    await expect(
      markClaimVerificationsPaid({
        appUserId: 'u1',
        paidAt,
        acquisitionId: 'journey-1',
      })
    ).resolves.toBe(0);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordStage).not.toHaveBeenCalled();
    expect(mocks.fileCard).not.toHaveBeenCalled();
  });
});
