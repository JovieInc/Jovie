import { describe, expect, it } from 'vitest';
import {
  buildClaimVerificationRequest,
  CLAIM_VERIFICATION_REACH_THRESHOLD,
  CLAIM_VERIFICATION_SETTINGS_KEY,
  type ClaimVerificationRecord,
  claimVerificationPendingMessage,
  compareProofStrength,
  currentProofEvidence,
  decideClaimVerificationRecord,
  isClaimFrozen,
  isClaimVerificationOpen,
  isProofBlockingPublication,
  markClaimVerificationPaid,
  markVerifiedByProof,
  openDispute,
  PROOF_METHODS,
  PROOF_STRENGTH,
  proofStrength,
  readClaimVerification,
  requiresClaimVerification,
  resolveDispute,
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

describe('proof strength', () => {
  it('ranks every method: OAuth, DNS, distributor and operator are strong', () => {
    expect(Object.keys(PROOF_STRENGTH).sort()).toEqual(
      [...PROOF_METHODS].sort()
    );
    for (const method of [
      'instagram_oauth',
      'youtube_oauth',
      'dns',
      'distributor',
      'operator',
    ] as const) {
      expect(proofStrength({ method })).toBe('strong');
    }
    expect(proofStrength({ method: 'domain_email' })).toBe('weak');
    expect(proofStrength({ method: 'legacy' })).toBe('legacy');
  });

  it('counts a website code as strong only on a Spotify-linked domain', () => {
    expect(proofStrength({ method: 'website_code' })).toBe('weak');
    expect(proofStrength({ method: 'website_code', domainLinked: false })).toBe(
      'weak'
    );
    expect(proofStrength({ method: 'website_code', domainLinked: true })).toBe(
      'strong'
    );
  });

  it('compares strong > weak > legacy', () => {
    expect(
      compareProofStrength({ method: 'dns' }, { method: 'domain_email' })
    ).toBeGreaterThan(0);
    expect(
      compareProofStrength({ method: 'domain_email' }, { method: 'legacy' })
    ).toBeGreaterThan(0);
    expect(
      compareProofStrength({ method: 'legacy' }, { method: 'operator' })
    ).toBeLessThan(0);
    expect(
      compareProofStrength(
        { method: 'instagram_oauth' },
        { method: 'website_code', domainLinked: true }
      )
    ).toBe(0);
  });
});

const pendingProof = () =>
  buildClaimVerificationRequest({
    spotifyArtistId: '06HL4z0CvFAxyc27GXpf02',
    artistName: 'Indie Artist',
    reach: 1_200,
    paid: false,
    proofOnly: true,
    proofCode: 'jovie-verify-abc',
    now,
  });
const verifiedAt = new Date('2026-11-01T09:00:00.000Z');
const disputedAt = new Date('2026-11-02T09:00:00.000Z');
const resolvedAt = new Date('2026-11-03T09:00:00.000Z');
const settingsOf = (record: ClaimVerificationRecord | null) =>
  withClaimVerification({}, record as ClaimVerificationRecord);

describe('markVerifiedByProof', () => {
  it('verifies a pending claim by strong proof with an ISO timestamp', () => {
    const verified = markVerifiedByProof(
      pendingProof(),
      'instagram_oauth',
      verifiedAt
    );
    expect(verified).toMatchObject({
      status: 'verified',
      proofMethod: 'instagram_oauth',
      verifiedAt: '2026-11-01T09:00:00.000Z',
      requestedAt: now.toISOString(),
    });
    expect(isProofBlockingPublication(settingsOf(verified))).toBe(false);
  });

  it('records whether a website code was on a linked domain', () => {
    expect(
      markVerifiedByProof(pendingProof(), 'website_code', verifiedAt, {
        domainLinked: true,
      })
    ).toMatchObject({ proofMethod: 'website_code', proofDomainLinked: true });
  });

  it('never verifies on weak or legacy proof alone', () => {
    expect(
      markVerifiedByProof(pendingProof(), 'domain_email', verifiedAt)
    ).toBeNull();
    expect(
      markVerifiedByProof(pendingProof(), 'website_code', verifiedAt)
    ).toBeNull();
    expect(
      markVerifiedByProof(pendingProof(), 'legacy', verifiedAt)
    ).toBeNull();
  });

  it('only moves pending_verification, so retries are no-ops', () => {
    const verified = markVerifiedByProof(pendingProof(), 'dns', verifiedAt);
    expect(markVerifiedByProof(verified, 'dns', verifiedAt)).toBeNull();
    expect(markVerifiedByProof(request(false), 'dns', verifiedAt)).toBeNull();
    expect(markVerifiedByProof(null, 'dns', verifiedAt)).toBeNull();
  });
});

describe('disputes', () => {
  const verifiedBy = (
    method: Parameters<typeof markVerifiedByProof>[1],
    domainLinked?: boolean
  ) =>
    markVerifiedByProof(pendingProof(), method, verifiedAt, { domainLinked });

  it('opens on a verified page with at least equal proof; the page stays up, frozen', () => {
    const disputed = openDispute(verifiedBy('instagram_oauth'), {
      claimantProofMethod: 'youtube_oauth',
      at: disputedAt,
    });
    expect(disputed).toMatchObject({
      status: 'disputed',
      proofMethod: 'instagram_oauth',
      dispute: {
        claimantProofMethod: 'youtube_oauth',
        openedAt: '2026-11-02T09:00:00.000Z',
      },
    });
    expect(isProofBlockingPublication(settingsOf(disputed))).toBe(false);
    expect(isClaimFrozen(settingsOf(disputed))).toBe(true);
  });

  it('refuses weaker proof, so a bare claim cannot freeze a real artist', () => {
    expect(
      openDispute(verifiedBy('dns'), {
        claimantProofMethod: 'domain_email',
        at: disputedAt,
      })
    ).toBeNull();
    expect(
      openDispute(verifiedBy('dns'), {
        claimantProofMethod: 'website_code',
        claimantDomainLinked: false,
        at: disputedAt,
      })
    ).toBeNull();
    expect(
      openDispute(verifiedBy('dns'), {
        claimantProofMethod: 'website_code',
        claimantDomainLinked: true,
        at: disputedAt,
      })
    ).not.toBeNull();
  });

  it('lets any real proof dispute a grandfathered legacy page, never legacy itself', () => {
    const legacy: ClaimVerificationRecord = {
      ...request(false),
      status: 'verified',
      proofMethod: 'legacy',
    };
    expect(
      openDispute(legacy, {
        claimantProofMethod: 'domain_email',
        at: disputedAt,
      })
    ).toMatchObject({ status: 'disputed' });
    expect(
      openDispute(legacy, { claimantProofMethod: 'legacy', at: disputedAt })
    ).toBeNull();
  });

  it('reads pre-2026-11 verified records: operator-decided is strong, else legacy', () => {
    const operatorDecided = decideClaimVerificationRecord(
      markClaimVerificationPaid(request(false), paidAt),
      { decision: 'approve', decidedAt: verifiedAt, decidedBy: 'admin_1' }
    ) as ClaimVerificationRecord;
    expect(operatorDecided.proofMethod).toBeUndefined();
    expect(currentProofEvidence(operatorDecided).method).toBe('operator');
    expect(
      openDispute(operatorDecided, {
        claimantProofMethod: 'domain_email',
        at: disputedAt,
      })
    ).toBeNull();
    expect(
      currentProofEvidence({ ...request(false), status: 'verified' }).method
    ).toBe('legacy');
  });

  it('only opens from verified', () => {
    for (const record of [pendingProof(), request(false), null]) {
      expect(
        openDispute(record, { claimantProofMethod: 'dns', at: disputedAt })
      ).toBeNull();
    }
    const disputed = openDispute(verifiedBy('dns'), {
      claimantProofMethod: 'dns',
      at: disputedAt,
    });
    expect(
      openDispute(disputed, { claimantProofMethod: 'dns', at: disputedAt })
    ).toBeNull();
  });

  describe('resolveDispute', () => {
    const disputed = () =>
      openDispute(verifiedBy('dns'), {
        claimantProofMethod: 'website_code',
        claimantDomainLinked: true,
        at: disputedAt,
      });

    it('keep returns the page to verified with the original proof', () => {
      const kept = resolveDispute(disputed(), {
        outcome: 'keep',
        decidedBy: 'admin_1',
        at: resolvedAt,
      });
      expect(kept).toMatchObject({
        status: 'verified',
        proofMethod: 'dns',
        verifiedAt: verifiedAt.toISOString(),
        dispute: {
          outcome: 'keep',
          decidedBy: 'admin_1',
          openedAt: disputedAt.toISOString(),
          decidedAt: resolvedAt.toISOString(),
        },
      });
      expect(isClaimFrozen(settingsOf(kept))).toBe(false);
    });

    it("transfer verifies on the claimant's proof", () => {
      expect(
        resolveDispute(disputed(), {
          outcome: 'transfer',
          decidedBy: 'admin_1',
          at: resolvedAt,
        })
      ).toMatchObject({
        status: 'verified',
        proofMethod: 'website_code',
        proofDomainLinked: true,
        verifiedAt: resolvedAt.toISOString(),
        dispute: { outcome: 'transfer' },
      });
    });

    it('take_down blocks publication, proof-only or not', () => {
      const down = resolveDispute(disputed(), {
        outcome: 'take_down',
        decidedBy: 'admin_1',
        at: resolvedAt,
      });
      expect(down?.status).toBe('taken_down');
      expect(isProofBlockingPublication(settingsOf(down))).toBe(true);
      const { proofOnly: _p, ...notProofOnly } =
        down as ClaimVerificationRecord;
      expect(
        isProofBlockingPublication(
          settingsOf(notProofOnly as ClaimVerificationRecord)
        )
      ).toBe(true);
      expect(isClaimFrozen(settingsOf(down))).toBe(false);
    });

    it('only resolves an open dispute, so repeated decisions are no-ops', () => {
      const kept = resolveDispute(disputed(), {
        outcome: 'keep',
        decidedBy: 'admin_1',
        at: resolvedAt,
      });
      expect(
        resolveDispute(kept, {
          outcome: 'take_down',
          decidedBy: 'admin_1',
          at: resolvedAt,
        })
      ).toBeNull();
      expect(
        resolveDispute(
          { ...(disputed() as ClaimVerificationRecord), dispute: undefined },
          { outcome: 'keep', decidedBy: null, at: resolvedAt }
        )
      ).toBeNull();
    });
  });

  it('reads the new statuses under the v1 schema', () => {
    const disputed = openDispute(verifiedBy('operator'), {
      claimantProofMethod: 'distributor',
      at: disputedAt,
    });
    const down = resolveDispute(disputed, {
      outcome: 'take_down',
      decidedBy: null,
      at: resolvedAt,
    });
    expect(readClaimVerification(settingsOf(disputed))?.status).toBe(
      'disputed'
    );
    expect(readClaimVerification(settingsOf(down))?.status).toBe('taken_down');
  });
});
