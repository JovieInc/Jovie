import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMITTED_CANARY_FIXTURE } from './admitted-canary-fixture';

const hoisted = vi.hoisted(() => ({
  rows: [] as unknown[],
  decide: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => hoisted.rows,
  };
  return { db: chain };
});
vi.mock('@/lib/claim/claim-verification-review.server', () => ({
  decideClaimVerification: hoisted.decide,
}));
vi.mock('@/lib/waitlist/audit', () => ({
  insertWaitlistAuditLog: hoisted.audit,
}));
vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: vi.fn(),
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn(),
}));
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: vi.fn(),
}));

const { verifyAdmittedCanaryOwnership } = await import(
  './admitted-canary.server'
);

const canaryRow = {
  handle: ADMITTED_CANARY_FIXTURE.handle,
  spotifyId: ADMITTED_CANARY_FIXTURE.artist.spotifyId,
  settings: {},
  ownerEmail: ADMITTED_CANARY_FIXTURE.email,
  waitlistEntryId: 'w1',
};

describe('verifyAdmittedCanaryOwnership', () => {
  beforeEach(() => {
    hoisted.decide.mockReset();
    hoisted.audit.mockReset();
  });

  it('never decides a profile owned by any other address', async () => {
    hoisted.rows = [{ ...canaryRow, ownerEmail: 'artist@gmail.com' }];
    await expect(
      verifyAdmittedCanaryOwnership({ profileId: 'p1' })
    ).rejects.toThrow(/not the admitted canary/);
    expect(hoisted.decide).not.toHaveBeenCalled();
    expect(hoisted.audit).not.toHaveBeenCalled();
  });

  it('approves through the operator decision and writes an audit row', async () => {
    hoisted.rows = [canaryRow];
    hoisted.decide.mockResolvedValue({ outcome: 'decided', record: {} });
    await expect(
      verifyAdmittedCanaryOwnership({ profileId: 'p1' })
    ).resolves.toEqual({ outcome: 'verified', profileId: 'p1' });
    expect(hoisted.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'p1',
        decision: 'approve',
        decidedBy: 'system_admitted_canary',
        fromCard: true,
      })
    );
    expect(hoisted.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        waitlistEntryId: 'w1',
        reason: 'admitted_canary_ownership_verified',
      })
    );
  });

  it('is idempotent once verified', async () => {
    hoisted.rows = [
      {
        ...canaryRow,
        settings: {
          claimVerification: {
            schema: 'jovie-claim-verification/v1',
            status: 'verified',
            spotifyArtistId: canaryRow.spotifyId,
            requestedAt: '2026-10-31T00:00:00.000Z',
            reach: { signal: 'spotify_followers', value: 0, threshold: 1 },
          },
        },
      },
    ];
    await expect(
      verifyAdmittedCanaryOwnership({ profileId: 'p1' })
    ).resolves.toEqual({ outcome: 'already_verified', profileId: 'p1' });
    expect(hoisted.decide).not.toHaveBeenCalled();
  });
});
