import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { listProductTruthClaims } from './claims';
import {
  admissibleProofRegistry,
  createProofPageContext,
  createProofRequest,
  DOGFOOD_METRIC_PROOF,
  findProofReadyPages,
  findUnresolvedProofClaims,
  LOGO_ASSET_SOURCE,
  MARKETING_PROOF_AUDIT_BASELINE,
  PROOF_REGISTRY,
  type ProofCandidate,
  proofEvidenceClass,
  proofFreshnessDate,
  selectProof,
  validateProof,
} from './proof';

const AS_OF = '2026-09-30T00:00:00.000Z';

function codes(candidate: ProofCandidate): readonly string[] {
  return validateProof(candidate, AS_OF).issues.map(issue => issue.code);
}

describe('proof registry', () => {
  it('fails logos without a permission record', () => {
    expect(
      codes({
        recordType: 'proof',
        id: 'logo-without-permission',
        kind: 'logo',
        claimId: 'relationship.logo.awal',
        brand: 'AWAL',
        relationship: 'customer',
        assetId: 'awal',
        source: LOGO_ASSET_SOURCE,
      })
    ).toContain('missing-logo-permission');
  });

  it('fails quotes without consent', () => {
    expect(
      codes({
        recordType: 'proof',
        id: 'quote-without-consent',
        kind: 'quote',
        claimId: 'customer.profile-outcome',
        verbatimText: 'My profile gives every fan a clear next step.',
        personOrRole: 'Independent artist',
        source: 'customer interview recording',
        validUntil: '2027-09-30T00:00:00.000Z',
      })
    ).toContain('missing-quote-consent');
  });

  it('fails metrics without a source', () => {
    expect(
      codes({
        recordType: 'proof',
        id: 'metric-without-source',
        kind: 'metric',
        claimId: 'activation.profile-claim-rate',
        value: 42,
        unit: 'percent',
        reproducingQuery: 'select claim_rate from activation_daily',
        measuredAt: '2026-09-29T00:00:00.000Z',
        sample: { size: 120, population: 'eligible profile visitors' },
      })
    ).toContain('missing-metric-source');
  });

  it('ranks deterministically and never selects one proof twice on a page', () => {
    const page = createProofPageContext('/test', AS_OF);
    const registry = [
      {
        recordType: 'proof',
        id: 'proof-b',
        kind: 'product-proof',
        claimId: 'claim-a',
        artifact: { kind: 'route', route: '/b' },
      },
      {
        recordType: 'proof',
        id: 'proof-a',
        kind: 'product-proof',
        claimId: 'claim-a',
        artifact: { kind: 'route', route: '/a' },
      },
    ] as const satisfies readonly ProofCandidate[];

    const section = {
      id: 'hero',
      kind: 'product-proof',
      claimId: 'claim-a',
      page,
    } as const;
    expect(selectProof(section, registry)).toMatchObject({ id: 'proof-a' });
    expect(selectProof(section, registry)).toMatchObject({ id: 'proof-b' });
    expect(selectProof(section, registry)).toMatchObject({
      recordType: 'proof-request',
      claimId: 'claim-a',
      pagesBlocked: ['/test'],
    });
  });

  it('drafts missing customer-quote outreach for a person without sending', () => {
    const request = selectProof({
      id: 'social-proof',
      kind: 'quote',
      claimId: 'customer.profile-outcome',
      page: createProofPageContext('/profiles', AS_OF),
    });

    expect(request).toMatchObject({
      recordType: 'proof-request',
      kind: 'quote',
      suggestedLane: 'customer-quote-outreach',
      outreach: { status: 'queued-for-person', autoSend: false },
    });
  });

  it('queues outreach for every unproven logo without sending it', () => {
    const logoItems = MARKETING_PROOF_AUDIT_BASELINE.items.filter(
      item => item.kind === 'logo'
    );
    expect(logoItems).toHaveLength(5);
    for (const item of logoItems) {
      expect(item.request.outreach).toMatchObject({
        status: 'queued-for-person',
        autoSend: false,
      });
      expect(item.request.pagesBlocked).toEqual([...item.pages].sort());
    }
  });

  it('gives every unproven audit item a proof request', () => {
    expect(MARKETING_PROOF_AUDIT_BASELINE.auditedPages.length).toBeGreaterThan(
      0
    );
    for (const item of MARKETING_PROOF_AUDIT_BASELINE.items) {
      expect(item.request.recordType).toBe('proof-request');
      expect(item.request.claimId).toBe(item.claimId);
      expect(item.missing.length).toBeGreaterThan(0);
    }
  });

  it('rejects a logo relationship outside customer, integration, press', () => {
    expect(
      codes({
        recordType: 'proof',
        id: 'logo-vague-relationship',
        kind: 'logo',
        claimId: 'relationship.logo.awal',
        brand: 'AWAL',
        relationship: 'partner' as never,
        assetId: 'awal',
        source: LOGO_ASSET_SOURCE,
        permissionRecord: {
          recordId: 'perm-1',
          grantedBy: 'AWAL marketing',
          grantedAt: '2026-09-01T00:00:00.000Z',
          scope: 'marketing site logo bar',
        },
      })
    ).toEqual(['missing-logo-relationship']);
  });

  it('accepts a fully permissioned logo', () => {
    expect(
      codes({
        recordType: 'proof',
        id: 'logo-permissioned',
        kind: 'logo',
        claimId: 'relationship.logo.awal',
        brand: 'AWAL',
        relationship: 'integration',
        assetId: 'awal',
        source: LOGO_ASSET_SOURCE,
        permissionRecord: {
          recordId: 'perm-1',
          grantedBy: 'AWAL marketing',
          grantedAt: '2026-09-01T00:00:00.000Z',
          scope: 'marketing site logo bar',
        },
      })
    ).toEqual([]);
  });

  it('ranks by section relevance, then audience, then freshness, then strength', () => {
    const route = (
      id: string,
      extra: Partial<ProofCandidate> = {}
    ): ProofCandidate =>
      ({
        recordType: 'proof',
        id,
        kind: 'product-proof',
        claimId: 'claim-rank',
        artifact: { kind: 'route', route: `/${id}` },
        ...extra,
      }) as ProofCandidate;
    const capture = (id: string, capturedAt: string, extra = {}) =>
      route(id, {
        artifact: {
          kind: 'screenshot-scenario',
          scenarioId: id,
          route: '/tim',
          capturedAt,
        },
        ...extra,
      } as Partial<ProofCandidate>);

    const registry = [
      route('a-generic'),
      route('b-other-audience', { audiences: ['developer'] }),
      capture('c-old', '2026-01-01T00:00:00.000Z', { audiences: ['artist'] }),
      capture('d-new', '2026-09-01T00:00:00.000Z', { audiences: ['artist'] }),
      route('e-weak-artist', { audiences: ['artist'], strength: 'weak' }),
      route('f-strong-artist', { audiences: ['artist'], strength: 'strong' }),
      route('g-section', { sectionIds: ['hero'] }),
    ];
    const page = createProofPageContext('/rank', AS_OF);
    const section = {
      id: 'hero',
      kind: 'product-proof',
      claimId: 'claim-rank',
      audience: 'artist',
      page,
    } as const;
    const order = registry.map(() => {
      const picked = selectProof(section, registry);
      return 'id' in picked ? picked.id : picked.recordType;
    });

    expect(order).toEqual([
      'g-section',
      'd-new',
      'c-old',
      'f-strong-artist',
      'e-weak-artist',
      'a-generic',
      'b-other-audience',
    ]);
    // Registry order must not change the ranking.
    const reversedPage = createProofPageContext('/rank', AS_OF);
    expect(
      selectProof({ ...section, page: reversedPage }, [...registry].reverse())
    ).toMatchObject({ id: 'g-section' });
  });

  it('prefers the requested kind and falls back in the declared order', () => {
    const page = createProofPageContext('/fallback', AS_OF);
    const registry = [
      {
        recordType: 'proof',
        id: 'fallback-route',
        kind: 'product-proof',
        claimId: 'claim-f',
        artifact: { kind: 'route', route: '/f' },
      },
    ] as const satisfies readonly ProofCandidate[];

    expect(
      selectProof(
        {
          id: 'social',
          kind: 'quote',
          fallbackKinds: ['product-proof'],
          claimId: 'claim-f',
          page,
        },
        registry
      )
    ).toMatchObject({ id: 'fallback-route' });
  });

  it('reads freshness from the kind-specific date', () => {
    expect(
      proofFreshnessDate({
        recordType: 'proof',
        id: 'm',
        kind: 'metric',
        claimId: 'c',
        measuredAt: '2026-09-01T00:00:00.000Z',
      })
    ).toBe('2026-09-01T00:00:00.000Z');
    expect(
      proofFreshnessDate({
        recordType: 'proof',
        id: 'r',
        kind: 'product-proof',
        claimId: 'c',
        artifact: { kind: 'route', route: '/r' },
      })
    ).toBeUndefined();
  });

  it('keeps the unproven audit baseline shrink-only', () => {
    // Remove an id here when its proof lands. Adding one needs a proof
    // request plan, never new unproven content on a live page.
    const allowed = new Set([
      'baseline-logo-awal',
      'baseline-logo-orchard',
      'baseline-logo-umg',
      'baseline-logo-armada',
      'baseline-logo-black-hole-recordings',
      'baseline-sell-out-tour-capture',
      'baseline-about-founder-experience',
      'baseline-launch-tracks-generated',
      'baseline-launch-ai-market',
      'baseline-launch-fan-ltv',
      'baseline-launch-demo-audience-metrics',
    ]);
    const ids = MARKETING_PROOF_AUDIT_BASELINE.items.map(item => item.id);
    expect(ids.filter(id => !allowed.has(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never renders a customer quote without consented proof', () => {
    const consented = new Set(
      PROOF_REGISTRY.filter(
        proof => proof.kind === 'quote' && validateProof(proof, AS_OF).valid
      ).map(proof => proof.kind === 'quote' && proof.verbatimText)
    );
    const unproven = ARTIST_PROFILE_SOCIAL_PROOF.quotes.filter(
      quote => !consented.has(quote.quote)
    );
    expect(unproven).toEqual([]);
  });

  it('reports proof items whose claim is not registered', () => {
    expect(
      findUnresolvedProofClaims(new Set(['claim-a']), [
        { id: 'proof-a', claimId: 'claim-a' },
        { id: 'proof-b', claimId: 'claim-missing' },
      ])
    ).toEqual([{ proofId: 'proof-b', claimId: 'claim-missing' }]);
    expect(findUnresolvedProofClaims(new Set())).toHaveLength(
      PROOF_REGISTRY.length
    );
  });

  it('links every registered proof to a claim in the product-truth registry', () => {
    const claimIds = new Set(listProductTruthClaims().map(claim => claim.id));
    expect(findUnresolvedProofClaims(claimIds)).toEqual([]);
  });

  it('does not count the tour capture as proof of the Sell Out outcome', () => {
    expect(
      PROOF_REGISTRY.some(
        proof =>
          proof.kind === 'product-proof' &&
          proof.artifact.kind === 'screenshot-scenario' &&
          proof.artifact.scenarioId === 'tim-white-profile-tour-mobile'
      )
    ).toBe(false);
    const item = MARKETING_PROOF_AUDIT_BASELINE.items.find(
      entry => entry.id === 'baseline-sell-out-tour-capture'
    );
    expect(item?.request).toEqual({
      recordType: 'proof-request',
      kind: 'product-proof',
      claimId: 'capability.events.ticket-sales',
      pagesBlocked: [
        '/',
        '/artist-profile',
        '/artist-profiles',
        '/solutions/artists',
      ],
      suggestedLane: 'product-capture',
      generator: 'dogfood',
    });
  });
});

describe('proof evidence classes and the ProofRequest loop (JOV-7750)', () => {
  const metric = (evidence?: 'dogfood' | 'pilot'): ProofCandidate => ({
    recordType: 'proof',
    id: `metric-${evidence ?? 'market'}`,
    kind: 'metric',
    claimId: 'dogfood.fixture',
    ...(evidence ? { evidence } : {}),
    value: 3,
    unit: 'subscribers',
    reproducingQuery: 'select 3',
    measuredAt: AS_OF,
    sample: { size: 3, population: 'fixture' },
    source: 'fixture',
  });

  it('classifies proof by whose outcome it shows', () => {
    expect(proofEvidenceClass(metric('dogfood'))).toBe('dogfood');
    expect(proofEvidenceClass(metric('pilot'))).toBe('pilot');
    expect(proofEvidenceClass(metric())).toBe('none');
    expect(
      PROOF_REGISTRY.filter(item => item.kind === 'product-proof').map(
        proofEvidenceClass
      )
    ).toEqual(['dogfood', 'dogfood']);
    expect(
      proofEvidenceClass({
        recordType: 'proof',
        id: 'press',
        kind: 'third-party',
        claimId: 'x',
        url: 'https://example.com',
        publisher: 'Example',
        date: AS_OF,
      })
    ).toBe('none');
  });

  it('registers every dogfood receipt as valid dogfood metric proof', () => {
    for (const proof of DOGFOOD_METRIC_PROOF) {
      expect(proofEvidenceClass(proof)).toBe('dogfood');
      expect(validateProof(proof, proof.measuredAt).valid).toBe(true);
      expect(Number(proof.value)).toBeGreaterThan(0);
    }
  });

  it('names the generator that can fill each request', () => {
    const generator = (kind: ProofCandidate['kind']) =>
      createProofRequest({ kind, claimId: 'c', pagesBlocked: ['/'] }).generator;
    expect(generator('metric')).toBe('dogfood');
    expect(generator('product-proof')).toBe('dogfood');
    expect(generator('quote')).toBe('pilot');
    expect(generator('logo')).toBe('pilot');
    expect(generator('third-party')).toBe('research');
    expect(
      createProofRequest({
        kind: 'metric',
        claimId: 'c',
        pagesBlocked: ['/'],
        generator: 'computed',
      }).generator
    ).toBe('computed');
  });

  it('turns a market fact behind a measured claim into a request', () => {
    const page = createProofPageContext('/pricing', AS_OF);
    const market = metric();
    const registry = admissibleProofRegistry(new Set(['dogfood.fixture']), [
      market,
    ]);
    expect(registry).toEqual([]);
    const selected = selectProof(
      { id: 'proof', claimId: 'dogfood.fixture', page, kind: 'metric' },
      registry
    );
    expect(selected.recordType).toBe('proof-request');
    expect(page.usedProofIds.size).toBe(0);
    expect(
      admissibleProofRegistry(new Set(['dogfood.fixture']), [
        market,
        metric('dogfood'),
      ]).map(item => item.id)
    ).toEqual(['metric-dogfood']);
    expect(admissibleProofRegistry(new Set(), [market])).toEqual([market]);
  });

  it('reports the pages to re-render once admissible proof lands', () => {
    const requests = [
      createProofRequest({
        kind: 'metric',
        claimId: 'dogfood.fixture',
        pagesBlocked: ['/pricing', '/'],
      }),
      createProofRequest({
        kind: 'quote',
        claimId: 'customer.outcome',
        pagesBlocked: ['/pricing'],
      }),
    ];
    expect(findProofReadyPages(requests, AS_OF, [])).toEqual([]);
    expect(findProofReadyPages(requests, AS_OF, [metric()])).toEqual([]);
    expect(findProofReadyPages(requests, AS_OF, [metric('dogfood')])).toEqual([
      { pageId: '/', claimIds: ['dogfood.fixture'] },
      { pageId: '/pricing', claimIds: ['dogfood.fixture'] },
    ]);
  });
});
