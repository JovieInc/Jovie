import { describe, expect, it } from 'vitest';
import { listProductTruthClaims } from '@/data/product-truth/claims';
import baseline from '@/data/product-truth/claims-baseline.json';
import {
  CLAIM_KINDS,
  type Claim,
  ClaimSchema,
  getCapabilityRoutes,
  getProductCapability,
} from '@/data/product-truth/registry';
import { hashClaim } from '@/data/product-truth/truth-sync';

const BASELINE_INVALID: readonly string[] = baseline.invalidClaims;

function claimProblems(claim: Claim): string[] {
  const problems: string[] = [];
  if (!getProductCapability(claim.capabilityId)) {
    problems.push(`unknown capability ${claim.capabilityId}`);
  }
  const parsed = ClaimSchema.safeParse(claim);
  if (!parsed.success) {
    problems.push(...parsed.error.issues.map(issue => issue.message));
  }
  return problems;
}

describe('product-truth registry — claims (truth-sync)', () => {
  it('uses only declared claim kinds and known capabilities', () => {
    for (const claim of listProductTruthClaims()) {
      expect(CLAIM_KINDS).toContain(claim.kind);
      expect(getProductCapability(claim.capabilityId)).not.toBeNull();
    }
  });

  it('every claim passes the schema, or is listed in the baseline', () => {
    const invalid = listProductTruthClaims()
      .filter(claim => claimProblems(claim).length > 0)
      .map(claim => claim.id);

    for (const id of invalid) {
      expect(
        BASELINE_INVALID,
        `claim ${id} fails validation and is not in the baseline`
      ).toContain(id);
    }
  });

  it('keeps the baseline shrink-only: valid claims must be removed', () => {
    const claims = listProductTruthClaims();
    for (const id of BASELINE_INVALID) {
      const claim = claims.find(c => c.id === id);
      expect(
        claim,
        `baseline entry ${id} is not a registered claim`
      ).toBeDefined();
      if (claim) {
        expect(
          claimProblems(claim),
          `baseline entry ${id} is now valid — remove it from claims-baseline.json`
        ).not.toEqual([]);
      }
    }
  });

  it('fails a metric claim with a non-evidenced source', () => {
    const claim: Claim = {
      id: 'fixture.unsourced-metric',
      capabilityId: 'smart-links',
      statement: '99% of artists ship faster.',
      kind: 'metric',
      source: 'feature',
    };
    expect(ClaimSchema.safeParse(claim).success).toBe(false);
  });

  it('hashes claims deterministically for truth-sync', () => {
    const claims = listProductTruthClaims();
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(hashClaim(claim)).toMatch(/^[0-9a-f]{12}$/u);
      expect(hashClaim(claim)).toBe(hashClaim({ ...claim }));
    }
  });

  it('attributes every claim to route data so truth-sync can report pages', () => {
    for (const claim of listProductTruthClaims()) {
      // Claims may target internal capabilities with no public pages; the
      // lookup must still succeed so truth-sync can report them.
      expect(Array.isArray(getCapabilityRoutes(claim.capabilityId))).toBe(true);
    }
  });
});
