import { describe, expect, it } from 'vitest';
import {
  createProofPageContext,
  LOGO_ASSET_SOURCE,
  MARKETING_PROOF_AUDIT_BASELINE,
  type ProofCandidate,
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
        relationship: 'distribution platform used by represented artists',
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
});
