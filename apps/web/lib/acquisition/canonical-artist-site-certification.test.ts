import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_ARTIST_SITE_CHECK_DEFINITIONS,
  CANONICAL_ARTIST_SITE_CHECKS,
  CANONICAL_ARTIST_SITE_REFERENCE,
  CANONICAL_PRO_MONTHLY_CENTS,
  CANONICAL_PRO_MONTHLY_USD,
  type CanonicalArtistSiteCertificationInput,
  type CanonicalArtistSiteReceipt,
  evaluateCanonicalArtistSiteCertification,
  priceClaimContradictions,
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

  it('automatically turns a previously green path RED after a regression', () => {
    expect(evaluateCanonicalArtistSiteCertification(input()).status).toBe(
      'GREEN'
    );
    expect(
      evaluateCanonicalArtistSiteCertification(
        input({
          receipts: patched('payment_entitlement', {
            status: 'failed',
            detail: 'Webhook did not grant the verified entitlement.',
          }),
        })
      ).status
    ).toBe('RED');
  });

  describe('price truth (certifier must not contradict its own receipts)', () => {
    it('derives the Pro handoff rule from the canonical price, not typed text', () => {
      const rule = CANONICAL_ARTIST_SITE_CHECK_DEFINITIONS.find(
        check => check.id === 'pro_handoff_199'
      )?.referenceRule;
      expect(CANONICAL_PRO_MONTHLY_USD).toBe(12);
      expect(CANONICAL_PRO_MONTHLY_CENTS).toBe(1200);
      expect(rule).toContain('$12/mo');
      expect(rule).not.toContain('199');
    });

    it('finds dollar, cent and plan-named price claims that are not the canonical price', () => {
      expect(
        priceClaimContradictions('truthful $199 monthly Pro handoff')
      ).toEqual(['$199']);
      expect(priceClaimContradictions('price is 19900 cents')).toEqual([
        '19900 cents',
      ]);
      expect(priceClaimContradictions('Artist Presence 19900')).toEqual([
        'Artist Presence 19900',
      ]);
      expect(
        priceClaimContradictions(
          'truthful $12 monthly Pro handoff, 1200 cents, Artist Presence 1200, free is $0'
        )
      ).toEqual([]);
    });

    it.each([
      ['USD 199', 'USD 199'],
      ['199 dollars', '199 dollars'],
      ['$1,200', '$1,200'],
      ['19,900 cents', '19,900 cents'],
      ['99 cents', '99 cents'],
      ['Artist Presence monthly 19900', 'Artist Presence monthly 19900'],
    ])('detects the supported Pro price claim %s', (text, claim) => {
      expect(priceClaimContradictions(text)).toContain(claim);
    });

    it('accepts canonical and free amounts in the supported formats', () => {
      expect(
        priceClaimContradictions(
          '$12, USD 12, 12 dollars, 1,200 cents, Artist Presence monthly 1200; $0, 0 cents'
        )
      ).toEqual([]);
    });

    it('treats plan-name regex metacharacters literally', async () => {
      vi.resetModules();
      vi.doMock('@/lib/config/plan-prices', async importOriginal => {
        const actual =
          await importOriginal<typeof import('@/lib/config/plan-prices')>();
        return {
          ...actual,
          ARTIST_VISIBILITY_OFFER: {
            ...actual.ARTIST_VISIBILITY_OFFER,
            pro: {
              ...actual.ARTIST_VISIBILITY_OFFER.pro,
              displayName: 'Artist Presence (+)',
            },
          },
        };
      });
      try {
        const { priceClaimContradictions: findClaims } = await import(
          './canonical-artist-site-certification'
        );
        expect(findClaims('Artist Presence (+) monthly 19900')).toEqual([
          'Artist Presence (+) monthly 19900',
        ]);
        expect(findClaims('Artist Presence  monthly 19900')).toEqual([]);
      } finally {
        vi.doUnmock('@/lib/config/plan-prices');
        vi.resetModules();
      }
    });

    it.each(['free_state_value', 'payment_entitlement'] as const)(
      'does not interpret unrelated amounts in %s as monthly Pro prices',
      checkId => {
        const result = evaluateCanonicalArtistSiteCertification(
          input({
            receipts: patched(checkId, {
              detail: 'Separate product annual total $144; tip $5; free is $0.',
              evidence: [
                'historical campaign budget $1,200; 500 cents refunded',
              ],
            }),
          })
        );
        expect(result.status).toBe('GREEN');
        expect(result.evidenceIntegrityFailures).toEqual([]);
      }
    );

    it('is RED, never GREEN, when a receipt asserts $199 while its evidence says 1200 cents (the 07:47Z contradiction)', () => {
      const receipts = patched('pro_handoff_199', {
        detail:
          'Live claim-first pricing exposed the truthful $199 monthly Pro handoff.',
        evidence: [
          'Artist Presence 1200',
          'gha://JovieInc/Jovie/actions/runs/42#m2',
        ],
      });
      const result = evaluateCanonicalArtistSiteCertification(
        input({ receipts })
      );
      expect(result.status).toBe('RED');
      expect(result.safeToSend).toBe(false);
      expect(result.evidenceIntegrityFailures.join('\n')).toMatch(
        /pro_handoff_199: price claim \$199 contradicts the canonical \$12\/mo \(1200 cents\)/
      );
    });

    it('is RED when evidence carries a stale cent amount even if the detail text is clean', () => {
      const receipts = patched('pro_handoff_199', {
        detail: 'Live pricing exposed the Pro handoff.',
        evidence: ['Artist Presence 19900'],
      });
      expect(
        evaluateCanonicalArtistSiteCertification(input({ receipts })).status
      ).toBe('RED');
    });

    it('stays GREEN when every price claim is the canonical price', () => {
      const receipts = patched('pro_handoff_199', {
        detail:
          'Live claim-first pricing exposed the truthful $12 monthly Pro handoff.',
        evidence: ['Artist Presence 1200', 'gha://run#m2'],
      });
      expect(
        evaluateCanonicalArtistSiteCertification(input({ receipts })).status
      ).toBe('GREEN');
    });
  });
});
