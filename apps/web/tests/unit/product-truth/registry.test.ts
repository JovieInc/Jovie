import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { MARKETING_FEATURE_CAPABILITIES } from '@/data/marketing/featureAvailability';
import baseline from '@/data/product-truth/claims-baseline.json';
import {
  CLAIM_KINDS,
  type Claim,
  ENTITLEMENT_CAPABILITY_MAP,
  FLAG_CAPABILITY_MAP,
  getCapability,
  getClaimsForCapability,
  MARKETING_CAPABILITY_IDS,
  PRODUCT_TRUTH_CAPABILITIES,
  PRODUCT_TRUTH_CLAIMS,
  validateClaim,
} from '@/data/product-truth/registry';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../'
);

const BASELINE_UNRESOLVED: readonly string[] = baseline.unresolvedClaims;

function claimResolves(claim: Claim): boolean {
  const sourcePath = path.join(REPO_ROOT, claim.source);
  if (!existsSync(sourcePath)) return false;
  const text = readFileSync(sourcePath, 'utf8');
  return (
    text.includes(claim.statement) ||
    (typeof claim.citation === 'string' && text.includes(claim.citation))
  );
}

describe('product-truth registry — capabilities', () => {
  it('keeps every marketing capability in the featureAvailability projection', () => {
    for (const id of MARKETING_CAPABILITY_IDS) {
      const capability = PRODUCT_TRUTH_CAPABILITIES[id];
      const record = MARKETING_FEATURE_CAPABILITIES[id];
      expect(record).toBeDefined();
      expect(record.capabilityId).toBe(capability.id);
      expect(record.maturity).toBe(capability.maturity);
      expect(record.publication).toBe(capability.publication);
      expect(record.access).toBe(capability.access);
      expect(record.audience).toBe(capability.audience);
      expect(record.offerId).toBe(capability.offerId);
      expect(record.supportedJobs).toEqual(capability.supportedJobs);
      expect(record.proofAuthorized).toBe(capability.proofAuthorized);
      expect(record.contentRevision).toBe(capability.contentRevision);
      expect(record.accessLabel).toBe(capability.accessLabel);
    }
  });

  it('binds every entitlement key (boolean + numeric) to a capability', () => {
    const registryKeys = new Set<string>();
    for (const plan of Object.values(ENTITLEMENT_REGISTRY)) {
      for (const key of Object.keys(plan.booleans)) registryKeys.add(key);
      for (const key of Object.keys(plan.limits)) registryKeys.add(key);
    }
    expect(registryKeys.size).toBeGreaterThan(0);
    for (const key of registryKeys) {
      const capabilityId = (
        ENTITLEMENT_CAPABILITY_MAP as Readonly<Record<string, string>>
      )[key];
      expect(
        capabilityId,
        `entitlement ${key} is not mapped to a capability`
      ).toBeDefined();
      expect(getCapability(capabilityId)).not.toBeNull();
      expect(getCapability(capabilityId)?.entitlementKeys).toContain(key);
    }
  });

  it('binds every app flag to a capability', () => {
    for (const flagName of Object.keys(APP_FLAG_DEFAULTS)) {
      const capabilityId = (
        FLAG_CAPABILITY_MAP as Readonly<Record<string, string>>
      )[flagName];
      expect(
        capabilityId,
        `flag ${flagName} is not mapped to a capability`
      ).toBeDefined();
      expect(getCapability(capabilityId)).not.toBeNull();
    }
  });
});

describe('product-truth registry — claims', () => {
  it('uses only declared claim kinds and known capabilities', () => {
    for (const claim of PRODUCT_TRUTH_CLAIMS) {
      expect(CLAIM_KINDS).toContain(claim.kind);
      expect(getCapability(claim.capabilityId)).not.toBeNull();
      expect(validateClaim(claim)).toEqual([]);
    }
  });

  it('fails a metric claim with no source', () => {
    const claim: Claim = {
      id: 'fixture-unsourced-metric',
      capabilityId: 'smart-links',
      statement: '99% of artists ship faster.',
      kind: 'metric',
      source: '',
    };
    expect(validateClaim(claim)).not.toEqual([]);
  });

  it('resolves every claim against its source file, or lists it in the baseline', () => {
    const unresolved = PRODUCT_TRUTH_CLAIMS.filter(
      claim => !claimResolves(claim)
    ).map(claim => claim.id);

    for (const id of unresolved) {
      expect(
        BASELINE_UNRESOLVED,
        `claim ${id} does not resolve in its source and is not in the baseline`
      ).toContain(id);
    }
  });

  it('keeps the baseline shrink-only: resolved claims must be removed', () => {
    for (const id of BASELINE_UNRESOLVED) {
      const claim = PRODUCT_TRUTH_CLAIMS.find(c => c.id === id);
      expect(
        claim,
        `baseline entry ${id} is not a registered claim`
      ).toBeDefined();
      if (claim) {
        expect(
          claimResolves(claim),
          `baseline entry ${id} now resolves — remove it from claims-baseline.json`
        ).toBe(false);
      }
    }
  });

  it('attributes claims to capabilities with evidence routes for truth-sync', () => {
    for (const claim of PRODUCT_TRUTH_CLAIMS) {
      // Claims may target internal capabilities with no public pages; the
      // lookup must still succeed so truth-sync can report them.
      expect(Array.isArray(getClaimsForCapability(claim.capabilityId))).toBe(
        true
      );
    }
  });
});
