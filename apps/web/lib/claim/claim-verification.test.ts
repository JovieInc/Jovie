import { describe, expect, it } from 'vitest';
import {
  buildClaimVerificationRequest,
  CLAIM_VERIFICATION_REACH_THRESHOLD,
  CLAIM_VERIFICATION_SETTINGS_KEY,
  claimVerificationPendingMessage,
  decideClaimVerificationRecord,
  isClaimVerificationOpen,
  markClaimVerificationPaid,
  readClaimVerification,
  requiresClaimVerification,
  withClaimVerification,
} from './claim-verification';

const now = new Date('2026-10-21T08:00:00.000Z');
const paidAt = new Date('2026-10-21T08:05:00.000Z');

const request = (paid = false) =>
  buildClaimVerificationRequest({
    spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
    artistName: '  Famous Artist ',
    reach: 2_400_000,
    paid,
    now,
  });

describe('claim verification threshold', () => {
  it('is one config value, defaulting to 50k Spotify followers', () => {
    expect(CLAIM_VERIFICATION_REACH_THRESHOLD).toBe(50_000);
  });

  it('holds artists at or above the threshold and leaves the wedge alone', () => {
    expect(requiresClaimVerification(50_000)).toBe(true);
    expect(requiresClaimVerification(80_000_000)).toBe(true);
    expect(requiresClaimVerification(49_999)).toBe(false);
    expect(requiresClaimVerification(0)).toBe(false);
  });

  it('does not treat unknown reach as high reach', () => {
    expect(requiresClaimVerification(null)).toBe(false);
    expect(requiresClaimVerification(undefined)).toBe(false);
    expect(requiresClaimVerification(Number.NaN)).toBe(false);
    expect(requiresClaimVerification(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('claim verification state machine', () => {
  it('starts unpaid requests at awaiting_payment with stage timestamps', () => {
    expect(request()).toEqual({
      schema: 'jovie-claim-verification/v1',
      status: 'awaiting_payment',
      spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
      artistName: 'Famous Artist',
      reach: {
        signal: 'spotify_followers',
        value: 2_400_000,
        threshold: 50_000,
      },
      requestedAt: now.toISOString(),
      paidAt: null,
    });
  });

  it('starts an already-paying requester at pending_verification', () => {
    expect(request(true)).toMatchObject({
      status: 'pending_verification',
      paidAt: now.toISOString(),
    });
  });

  it('moves awaiting_payment to pending_verification on payment', () => {
    expect(markClaimVerificationPaid(request(), paidAt)).toMatchObject({
      status: 'pending_verification',
      requestedAt: now.toISOString(),
      paidAt: paidAt.toISOString(),
    });
  });

  it('makes webhook retries and decided requests no-ops', () => {
    const pending = markClaimVerificationPaid(request(), paidAt);
    expect(markClaimVerificationPaid(pending, paidAt)).toBeNull();
    expect(markClaimVerificationPaid(null, paidAt)).toBeNull();
    expect(
      markClaimVerificationPaid({ ...request(), status: 'verified' }, paidAt)
    ).toBeNull();
    expect(
      markClaimVerificationPaid({ ...request(), status: 'rejected' }, paidAt)
    ).toBeNull();
  });

  it('treats only awaiting_payment and pending_verification as open', () => {
    expect(isClaimVerificationOpen(request())).toBe(true);
    expect(isClaimVerificationOpen(request(true))).toBe(true);
    expect(isClaimVerificationOpen({ ...request(), status: 'verified' })).toBe(
      false
    );
    expect(isClaimVerificationOpen(null)).toBe(false);
  });
});

describe('claim verification settings storage', () => {
  it('round-trips through profile settings without dropping other keys', () => {
    const settings = withClaimVerification(
      { onboarding: { claimedAt: 'x' } },
      request()
    );
    expect(settings.onboarding).toEqual({ claimedAt: 'x' });
    expect(readClaimVerification(settings)).toEqual(request());
  });

  it('ignores malformed or foreign records', () => {
    expect(readClaimVerification(null)).toBeNull();
    expect(readClaimVerification([])).toBeNull();
    expect(
      readClaimVerification({ [CLAIM_VERIFICATION_SETTINGS_KEY]: 'pending' })
    ).toBeNull();
    expect(
      readClaimVerification({
        [CLAIM_VERIFICATION_SETTINGS_KEY]: { ...request(), schema: 'other' },
      })
    ).toBeNull();
    expect(
      readClaimVerification({
        [CLAIM_VERIFICATION_SETTINGS_KEY]: { ...request(), status: 'approved' },
      })
    ).toBeNull();
  });

  it('tells the requester verification is in progress', () => {
    expect(claimVerificationPendingMessage('Famous Artist')).toMatch(
      /^Verification in progress\. Famous Artist has a large audience/
    );
    expect(claimVerificationPendingMessage('')).toContain('This artist');
  });
});

describe('operator decision transition', () => {
  const decidedAt = new Date('2026-10-22T09:00:00.000Z');
  const pending = () => markClaimVerificationPaid(request(), paidAt, 'j-1');

  it('keeps the funnel journey from payment for decision stages', () => {
    expect(pending()?.acquisitionId).toBe('j-1');
  });

  it('approves a pending request with who and when', () => {
    expect(
      decideClaimVerificationRecord(pending(), {
        decision: 'approve',
        decidedAt,
        decidedBy: 'tim@jov.ie',
        reason: '  label email matched ',
      })
    ).toMatchObject({
      status: 'verified',
      decidedAt: decidedAt.toISOString(),
      decidedBy: 'tim@jov.ie',
      decisionReason: 'label email matched',
      refundId: null,
    });
  });

  it('records the refund on a rejection', () => {
    expect(
      decideClaimVerificationRecord(pending(), {
        decision: 'reject',
        decidedAt,
        decidedBy: 'tim@jov.ie',
        refundId: 're_123',
      })
    ).toMatchObject({ status: 'rejected', refundId: 're_123' });
  });

  it('only decides pending_verification, so repeated clicks are no-ops', () => {
    const input = { decision: 'reject', decidedAt, decidedBy: null } as const;
    expect(decideClaimVerificationRecord(request(), input)).toBeNull();
    expect(decideClaimVerificationRecord(null, input)).toBeNull();
    const rejected = decideClaimVerificationRecord(pending(), input);
    expect(decideClaimVerificationRecord(rejected, input)).toBeNull();
  });
});
