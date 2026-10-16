import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ARTIST_SITE_CHECKS,
  CANONICAL_ARTIST_SITE_REFERENCE,
  type CanonicalArtistSiteCertificationInput,
  type CanonicalArtistSiteReceipt,
  evaluateCanonicalArtistSiteCertification,
} from './canonical-artist-site-certification';

const candidateId = 'acquisition:premade-artist-profile:tim-white:run-42';
const runId = 'run-42';
const sourceRevision = '8d2f49a8bdb2618db89368931d2313158b0a01bc';
const observedAt = '2026-10-14T12:00:00.000Z';

function receipt(
  checkId: (typeof CANONICAL_ARTIST_SITE_CHECKS)[number],
  overrides: Partial<CanonicalArtistSiteReceipt> = {}
): CanonicalArtistSiteReceipt {
  return {
    checkId,
    candidateId,
    runId,
    sourceRevision,
    observedAt,
    status: checkId === 'deferred_surfaces' ? 'hidden' : 'passed',
    detail: `${checkId} evidence passed`,
    evidence: [`gha://JovieInc/Jovie/actions/runs/42#${checkId}`],
    ...overrides,
  };
}

function patched(
  checkId: (typeof CANONICAL_ARTIST_SITE_CHECKS)[number],
  overrides: Partial<CanonicalArtistSiteReceipt>
) {
  return CANONICAL_ARTIST_SITE_CHECKS.map(id =>
    receipt(id, id === checkId ? overrides : {})
  );
}

function input(
  overrides: Partial<CanonicalArtistSiteCertificationInput> = {}
): CanonicalArtistSiteCertificationInput {
  return {
    candidateId,
    runId,
    sourceRevision,
    evaluatedAt: '2026-10-14T12:01:00.000Z',
    checkoutApplicable: true,
    receipts: CANONICAL_ARTIST_SITE_CHECKS.map(checkId => receipt(checkId)),
    ...overrides,
  };
}

describe('canonical artist-site certification (JOV-6572)', () => {
  it('derives GREEN from the JOV-6571 contract and queues human review/send', () => {
    const result = evaluateCanonicalArtistSiteCertification(input());

    expect(result.reference).toEqual(CANONICAL_ARTIST_SITE_REFERENCE);
    expect(result.reference.decision).toBe('JOV-6571');
    expect(result.statusLine).toBe('GREEN — safe to send an artist through');
    expect(result.safeToSend).toBe(true);
    expect(result.queue).toBe('human_review_send');
    expect(result.failingChecks).toEqual([]);
    expect(result.checks).toHaveLength(CANONICAL_ARTIST_SITE_CHECKS.length);
  });

  it('returns RED when a known required feature breaks', () => {
    const result = evaluateCanonicalArtistSiteCertification(
      input({
        receipts: patched('claim_auth_intent', {
          status: 'failed',
          detail: 'Claim handle was lost at auth.',
          defectRef: 'JOV-9999',
        }),
      })
    );

    expect(result.status).toBe('RED');
    expect(result.queue).toBe('blocked');
    expect(result.failingChecks).toEqual([
      expect.objectContaining({
        id: 'claim_auth_intent',
        defectRef: 'JOV-9999',
      }),
    ]);
  });

  it('accepts only non-promised deferred surfaces as hidden', () => {
    const allowed = evaluateCanonicalArtistSiteCertification(input());
    expect(allowed.status).toBe('GREEN');

    const promised = evaluateCanonicalArtistSiteCertification(
      input({ cohortPromiseDependencies: ['deferred_surfaces'] })
    );
    expect(promised.status).toBe('RED');
    expect(promised.failingChecks[0]?.id).toBe('deferred_surfaces');
  });

  it('allows payment to be not applicable only when checkout is not applicable', () => {
    const receipts = CANONICAL_ARTIST_SITE_CHECKS.map(checkId =>
      receipt(
        checkId,
        checkId === 'payment_entitlement' ? { status: 'not_applicable' } : {}
      )
    );

    expect(
      evaluateCanonicalArtistSiteCertification(
        input({ checkoutApplicable: false, receipts })
      ).status
    ).toBe('GREEN');
    expect(
      evaluateCanonicalArtistSiteCertification(input({ receipts })).status
    ).toBe('RED');
  });

  it.each([
    [
      'missing receipt',
      CANONICAL_ARTIST_SITE_CHECKS.slice(1).map(checkId => receipt(checkId)),
    ],
    [
      'duplicate receipt',
      [
        ...CANONICAL_ARTIST_SITE_CHECKS.map(checkId => receipt(checkId)),
        receipt('identity_catalog'),
      ],
    ],
    [
      'candidate mismatch',
      patched('identity_catalog', { candidateId: 'different-candidate' }),
    ],
    ['run mismatch', patched('identity_catalog', { runId: 'different-run' })],
    [
      'source mismatch',
      patched('identity_catalog', { sourceRevision: 'different-revision' }),
    ],
    ['missing evidence', patched('identity_catalog', { evidence: [] })],
  ] as const)('fails closed for %s', (_name, receipts) => {
    const result = evaluateCanonicalArtistSiteCertification(
      input({ receipts: [...receipts] })
    );
    expect(result.status).toBe('RED');
    expect(result.evidenceIntegrityFailures.length).toBeGreaterThan(0);
  });
});
