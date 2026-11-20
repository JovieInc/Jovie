import { describe, expect, it } from 'vitest';
import {
  type ClaimVerificationRecord,
  withClaimVerification,
} from './claim-verification';
import {
  LEGACY_GRANDFATHER_DECIDED_BY,
  legacyNudgeForDashboard,
  legacyVerificationState,
  markLegacyNudgeSent,
  requireLegacyProof,
} from './legacy-verification';

const migratedAt = new Date('2026-11-02T00:00:00.000Z');
const dueAt = '2026-12-02T00:00:00.000Z';
const beforeDue = new Date('2026-11-20T00:00:00.000Z');
const afterDue = new Date('2026-12-03T00:00:00.000Z');

function legacy(
  followers: number,
  overrides: Partial<ClaimVerificationRecord> = {}
): ClaimVerificationRecord {
  return {
    schema: 'jovie-claim-verification/v1',
    status: 'verified',
    proofMethod: 'legacy',
    spotifyArtistId: 'artist-1',
    artistName: 'Artist One',
    reach: { signal: 'spotify_followers', value: followers, threshold: 50_000 },
    requestedAt: migratedAt.toISOString(),
    paidAt: null,
    decidedAt: migratedAt.toISOString(),
    decidedBy: LEGACY_GRANDFATHER_DECIDED_BY,
    legacyNudgeDueAt: dueAt,
    ...overrides,
  };
}

describe('legacyVerificationState', () => {
  it('is ok for anything that is not a legacy record', () => {
    expect(legacyVerificationState(null, afterDue)).toBe('ok');
    expect(
      legacyVerificationState(
        legacy(90_000, { proofMethod: 'website_code' }),
        afterDue
      )
    ).toBe('ok');
  });

  it('nudges a small legacy claim before and after the window', () => {
    expect(legacyVerificationState(legacy(1_200), beforeDue)).toBe('nudge');
    expect(legacyVerificationState(legacy(1_200), afterDue)).toBe('nudge');
  });

  it('nudges a 50k+ claim inside the window and requires proof after it', () => {
    expect(legacyVerificationState(legacy(50_000), beforeDue)).toBe('nudge');
    expect(legacyVerificationState(legacy(50_000), afterDue)).toBe(
      'proof_required'
    );
    expect(legacyVerificationState(legacy(50_000), new Date(dueAt))).toBe(
      'proof_required'
    );
  });

  it('counts follower growth after the migration, never a lower live count', () => {
    expect(legacyVerificationState(legacy(10_000), afterDue, 75_000)).toBe(
      'proof_required'
    );
    expect(legacyVerificationState(legacy(75_000), afterDue, 0)).toBe(
      'proof_required'
    );
  });

  it('fails closed on a missing due date for a 50k+ claim', () => {
    expect(
      legacyVerificationState(
        legacy(80_000, { legacyNudgeDueAt: undefined }),
        beforeDue
      )
    ).toBe('proof_required');
  });

  it('requires proof for a disputed legacy claim at any reach', () => {
    expect(
      legacyVerificationState(legacy(10, { status: 'disputed' }), beforeDue)
    ).toBe('proof_required');
  });
});

describe('markLegacyNudgeSent', () => {
  it('stamps the nudge stage once', () => {
    const stamped = markLegacyNudgeSent(legacy(1_200), beforeDue);
    expect(stamped?.nudgeSentAt).toBe(beforeDue.toISOString());
    expect(markLegacyNudgeSent(stamped, afterDue)).toBeNull();
  });

  it('does not stamp a claim that needs proof or is not legacy', () => {
    expect(markLegacyNudgeSent(legacy(90_000), afterDue)).toBeNull();
    expect(markLegacyNudgeSent(null, afterDue)).toBeNull();
  });
});

describe('requireLegacyProof', () => {
  it('reopens a high-reach claim past the window as a proof-only request', () => {
    const next = requireLegacyProof(legacy(90_000), {
      now: afterDue,
      currentReach: 120_000,
      proofCode: 'jovie-verify-abc',
    });
    expect(next).toMatchObject({
      status: 'pending_verification',
      proofOnly: true,
      proofCode: 'jovie-verify-abc',
      reach: { value: 120_000, threshold: 50_000 },
      legacyProofRequiredAt: afterDue.toISOString(),
    });
    expect(next?.proofMethod).toBeUndefined();
    expect(next?.decidedBy).toBeUndefined();
    // A reopened record is no longer legacy, so a re-run is a no-op.
    expect(legacyVerificationState(next, afterDue)).toBe('ok');
    expect(
      requireLegacyProof(next, { now: afterDue, proofCode: 'x' })
    ).toBeNull();
  });

  it('leaves small claims, claims inside the window and disputes alone', () => {
    const input = { now: afterDue, proofCode: 'x' };
    expect(requireLegacyProof(legacy(1_200), input)).toBeNull();
    expect(
      requireLegacyProof(legacy(90_000), { ...input, now: beforeDue })
    ).toBeNull();
    expect(
      requireLegacyProof(legacy(90_000, { status: 'disputed' }), input)
    ).toBeNull();
  });
});

describe('legacyNudgeForDashboard', () => {
  it('exposes the nudge for a legacy record and nothing otherwise', () => {
    expect(
      legacyNudgeForDashboard(
        withClaimVerification({ theme: 'dark' }, legacy(1_200)),
        beforeDue
      )
    ).toEqual({ state: 'nudge', dueAt, nudgeSentAt: null });
    expect(
      legacyNudgeForDashboard(
        withClaimVerification({}, legacy(90_000)),
        afterDue
      )
    ).toEqual({ state: 'proof_required', dueAt, nudgeSentAt: null });
    expect(legacyNudgeForDashboard({}, afterDue)).toBeNull();
    expect(legacyNudgeForDashboard(null, afterDue)).toBeNull();
  });
});
