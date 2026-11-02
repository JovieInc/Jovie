import { describe, expect, it } from 'vitest';
import {
  buildClaimVerificationRequest,
  buildSelfServeClaimProof,
  CLAIM_VERIFICATION_REACH_THRESHOLD,
  CLAIM_VERIFICATION_SETTINGS_KEY,
  claimVerificationPendingMessage,
  decideClaimVerificationRecord,
  isClaimVerificationOpen,
  isProofBlockingPublication,
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

  it('only decides pending_verification, so repeated clicks are no-ops', () => {
    const input = { decision: 'reject', decidedAt, decidedBy: null } as const;
    expect(decideClaimVerificationRecord(request(), input)).toBeNull();
    expect(decideClaimVerificationRecord(null, input)).toBeNull();
    const rejected = decideClaimVerificationRecord(pending(), input);
    expect(decideClaimVerificationRecord(rejected, input)).toBeNull();
  });
});

describe('proof-only requests (free admission, private page)', () => {
  it('open for review immediately without a payment timestamp', () => {
    const record = buildClaimVerificationRequest({
      spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
      artistName: 'Mid Artist',
      reach: 3_200,
      paid: false,
      proofOnly: true,
      now,
    });
    expect(record.status).toBe('pending_verification');
    expect(record.paidAt).toBeNull();
  });

  it('keeps the default: unpaid and not proof-only waits for payment', () => {
    expect(request(false).status).toBe('awaiting_payment');
  });
});

describe('isProofBlockingPublication', () => {
  const settingsWith = (record: object) =>
    withClaimVerification({}, record as never);
  const proof = (status: 'pending_verification' | 'verified' | 'rejected') => ({
    ...buildClaimVerificationRequest({
      spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
      artistName: 'Mid Artist',
      reach: 3_200,
      paid: false,
      proofOnly: true,
      now,
    }),
    status,
  });

  it('blocks publication while proof is open or rejected, never once verified', () => {
    expect(
      isProofBlockingPublication(settingsWith(proof('pending_verification')))
    ).toBe(true);
    expect(isProofBlockingPublication(settingsWith(proof('rejected')))).toBe(
      true
    );
    expect(isProofBlockingPublication(settingsWith(proof('verified')))).toBe(
      false
    );
  });

  it('never blocks paid high-reach requests or profiles without a record', () => {
    expect(isProofBlockingPublication(settingsWith(request(true)))).toBe(false);
    expect(isProofBlockingPublication({})).toBe(false);
    expect(isProofBlockingPublication(null)).toBe(false);
  });

  it('records proofOnly on the request so it survives any waitlist write', () => {
    expect(proof('pending_verification').proofOnly).toBe(true);
  });
});

describe('self-serve claim proof (Tim, 2026-11-02)', () => {
  const proofCode = 'jovie-verify-abcdefghjk';
  const selfServe = (settings: unknown, spotifyArtistId = 'small_artist') =>
    buildSelfServeClaimProof({
      settings,
      spotifyArtistId,
      artistName: 'Small Artist',
      followers: null,
      proofCode,
      now,
    });

  it('creates a proof-only pending request that blocks publication', () => {
    const record = selfServe({});
    expect(record).toMatchObject({
      status: 'pending_verification',
      proofOnly: true,
      proofCode,
      spotifyArtistId: 'small_artist',
      paidAt: null,
      requestedAt: now.toISOString(),
      reach: { value: 0 },
    });
    expect(isProofBlockingPublication(withClaimVerification({}, record!))).toBe(
      true
    );
  });

  it('keeps an open proof-only request as it is', () => {
    const settings = withClaimVerification({}, selfServe({})!);
    expect(selfServe(settings)).toBeNull();
    expect(selfServe(settings, 'other_artist')).toBeNull();
  });

  it('keeps a verified record for the same artist, gates a new one', () => {
    const verified = decideClaimVerificationRecord(selfServe({}), {
      decision: 'approve',
      decidedAt: paidAt,
      decidedBy: 'operator',
    })!;
    const settings = withClaimVerification({}, verified);
    expect(selfServe(settings)).toBeNull();
    expect(selfServe(settings, 'other_artist')).toMatchObject({
      spotifyArtistId: 'other_artist',
      status: 'pending_verification',
      proofOnly: true,
    });
  });

  it('turns an open paid request proof-only without losing the payment', () => {
    const paid = request(true);
    const record = selfServe(withClaimVerification({}, paid), 'other_artist');
    expect(record).toMatchObject({
      spotifyArtistId: paid.spotifyArtistId,
      status: 'pending_verification',
      paidAt: paid.paidAt,
      proofOnly: true,
      proofCode,
    });
  });
});
