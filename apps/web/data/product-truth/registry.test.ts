import { describe, expect, it } from 'vitest';
import {
  getCapabilityRecord,
  MARKETING_FEATURE_CAPABILITIES,
} from '@/data/marketing/featureAvailability';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { CODE_FLAGS } from '@/lib/flags/code-flags';
import { APP_FLAG_KEYS } from '@/lib/flags/contracts';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { SCREENSHOT_SCENARIO_IDS } from '@/lib/screenshots/registry';
import {
  classifyPlanFeature,
  EVIDENCED_CLAIMS,
  listProductTruthClaims,
  slugifyClaimSegment,
} from './claims';
import {
  CapabilitySchema,
  ClaimSchema,
  getCapabilityRoutes,
  getEntitlementCapabilityId,
  getProductCapability,
  listCapabilities,
  MARKETING_STATIC_ACCESS_FLAGS,
  MARKETING_STATIC_PRESENTATION_FLAG_PATTERN,
  PRODUCT_CAPABILITIES,
  PRODUCT_FLAG_CAPABILITIES,
  ROUTE_CAPABILITY_BINDINGS,
} from './registry';

const baseClaim = {
  id: 'fixture.claim',
  capabilityId: 'public-profile',
  statement: 'Fixture statement',
  kind: 'capability',
  source: 'feature',
} as const;

describe('product-truth capabilities', () => {
  it('every capability passes the schema', () => {
    for (const capability of listCapabilities()) {
      expect(CapabilitySchema.safeParse(capability).error).toBeUndefined();
    }
  });

  it('rejects a proposed capability that grants access', () => {
    const [first] = listCapabilities();
    const result = CapabilitySchema.safeParse({
      ...first,
      maturity: 'proposed',
      access: 'open',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a published interest-capture capability without an access label', () => {
    const card = listCapabilities().find(c => c.id === 'jovie-card');
    const { accessLabel: _omit, ...marketing } = card!.marketing!;
    const result = CapabilitySchema.safeParse({ ...card, marketing });
    expect(result.success).toBe(false);
  });

  it('every entitlement key maps to exactly one capability', () => {
    const plan = ENTITLEMENT_REGISTRY.free;
    const keys = [
      ...Object.keys(plan.booleans),
      ...Object.keys(plan.limits),
    ].sort();
    const mapped = listCapabilities()
      .flatMap(capability => capability.entitlementKeys)
      .sort();
    expect(mapped).toEqual(keys);
    for (const key of keys) {
      expect(getEntitlementCapabilityId(key)).not.toBeNull();
    }
    expect(getEntitlementCapabilityId('notAnEntitlement')).toBeNull();
  });

  it('every app and code flag maps to a capability or is declared non-marketing', () => {
    const flagNames = [
      ...Object.keys(APP_FLAG_KEYS),
      ...Object.keys(CODE_FLAGS),
    ].sort();
    expect(Object.keys(PRODUCT_FLAG_CAPABILITIES).sort()).toEqual(flagNames);
    for (const binding of Object.values(PRODUCT_FLAG_CAPABILITIES)) {
      if ('capabilityId' in binding) {
        expect(getProductCapability(binding.capabilityId)).not.toBeNull();
      } else {
        expect(binding.nonMarketing.length).toBeGreaterThan(0);
      }
    }
  });

  it('capability flagKeys are real flags bound back to the same capability', () => {
    for (const capability of listCapabilities()) {
      if (!capability.flagKey) continue;
      const binding = (
        PRODUCT_FLAG_CAPABILITIES as Record<string, { capabilityId?: string }>
      )[capability.flagKey];
      expect(binding?.capabilityId).toBe(capability.id);
    }
  });

  it('marketing-static flags are presentation toggles or declared access gates', () => {
    for (const name of Object.keys(FEATURE_FLAGS)) {
      const declared =
        MARKETING_STATIC_PRESENTATION_FLAG_PATTERN.test(name) ||
        (MARKETING_STATIC_ACCESS_FLAGS as readonly string[]).includes(name);
      expect(declared, name).toBe(true);
    }
  });

  it('capture scenarios exist in the screenshot registry', () => {
    for (const capability of listCapabilities()) {
      for (const scenario of capability.evidence.captureScenarios) {
        expect(SCREENSHOT_SCENARIO_IDS.has(scenario), scenario).toBe(true);
      }
    }
  });

  it('route bindings resolve to marketing capabilities and routes union evidence', () => {
    for (const [route, capabilityId] of Object.entries(
      ROUTE_CAPABILITY_BINDINGS
    )) {
      expect(getProductCapability(capabilityId)?.marketing).toBeDefined();
      expect(getCapabilityRoutes(capabilityId)).toContain(route);
    }
    expect(getCapabilityRoutes('public-profile')).toEqual([
      '/pricing',
      '/product',
    ]);
    expect(getCapabilityRoutes('unknown')).toEqual([]);
    expect(getProductCapability(null)).toBeNull();
    expect(getProductCapability('unknown')).toBeNull();
  });

  it('certifies the live profile summary and public Ask without a flag or marketing route', () => {
    for (const id of [
      'agent-readable-profile-summary',
      'public-ask',
    ] as const) {
      const capability = getProductCapability(id);
      expect(capability).toMatchObject({
        maturity: 'general_availability',
        publication: 'public',
        access: 'open',
        entitlementKeys: [],
      });
      expect(capability?.flagKey).toBeUndefined();
      expect(capability?.marketing).toMatchObject({
        audience: 'general',
        proofAuthorized: true,
      });
      expect(Object.values(ROUTE_CAPABILITY_BINDINGS)).not.toContain(id);
    }

    expect(
      getProductCapability('agent-readable-profile-summary')?.evidence.routes
    ).toEqual(['/{username}/llms.txt']);
    expect(getProductCapability('public-ask')?.evidence.routes).toEqual([
      '/{username}',
      '/api/profile/{username}/ask',
    ]);
    expect(getCapabilityRoutes('agent-readable-profile-summary')).toEqual([
      '/{username}/llms.txt',
    ]);
    expect(getCapabilityRoutes('public-ask')).toEqual([
      '/api/profile/{username}/ask',
      '/{username}',
    ]);
  });
});

describe('featureAvailability projection', () => {
  it('projects exactly the capabilities with a marketing block', () => {
    const marketingIds = Object.entries(PRODUCT_CAPABILITIES)
      .filter(([, definition]) => 'marketing' in definition)
      .map(([id]) => id);
    expect(Object.keys(MARKETING_FEATURE_CAPABILITIES)).toEqual(marketingIds);
    expect(getCapabilityRecord('fan-crm')).toBeNull();
  });

  it('keeps registry state and marketing fields on the projected record', () => {
    const card = MARKETING_FEATURE_CAPABILITIES['jovie-card'];
    expect(card).toMatchObject({
      capabilityId: 'jovie-card',
      maturity: 'proposed',
      publication: 'public',
      access: 'interest_capture',
      audience: 'general',
      proofAuthorized: true,
      contentRevision: '2026-09-19',
    });
    expect(card.offerId).toBeUndefined();
    expect(MARKETING_FEATURE_CAPABILITIES['smart-links'].offerId).toBe(
      'artist-visibility-offer-contract-v1'
    );
  });
});

describe('product-truth claims', () => {
  const claims = listProductTruthClaims();

  it('every derived claim passes the schema and binds a known capability', () => {
    for (const claim of claims) {
      expect(ClaimSchema.safeParse(claim).error, claim.id).toBeUndefined();
      expect(getProductCapability(claim.capabilityId), claim.id).not.toBeNull();
    }
  });

  it('claim ids are unique', () => {
    const ids = claims.map(claim => claim.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derives offer claims from offer truth without retyping prices', () => {
    const offerIds = claims
      .filter(claim => claim.kind === 'offer')
      .map(claim => claim.id);
    expect(offerIds).toContain('offer.pro.price');
    expect(offerIds).toContain('offer.enterprise.note');
    expect(offerIds.some(id => id.startsWith('offer.max'))).toBe(false);
  });

  it('derives plan claims from published entitlement plans only', () => {
    expect(claims.some(claim => claim.id === 'plan.pro.verified-badge')).toBe(
      true
    );
    expect(claims.some(claim => claim.id.startsWith('plan.max'))).toBe(false);
    expect(claims.some(claim => /all-free-features/u.test(claim.id))).toBe(
      false
    );
  });

  it('no metric claims exist without evidence', () => {
    const metrics = claims.filter(
      claim => claim.kind === 'metric' || claim.kind === 'comparison'
    );
    expect(metrics.length).toBe(EVIDENCED_CLAIMS.length);
    for (const claim of metrics) {
      expect(claim.citation, claim.id).toBeTruthy();
      expect(claim.validUntil, claim.id).toBeTruthy();
      expect(['external-cited', 'measured'], claim.id).toContain(claim.source);
    }
  });

  it('a metric claim without a measured or cited source fails', () => {
    const result = ClaimSchema.safeParse({
      ...baseClaim,
      kind: 'metric',
      source: 'feature',
      statement: '10,000 artists use Jovie',
    });
    expect(result.success).toBe(false);
  });

  it('a metric claim with a source still needs a citation and expiry', () => {
    expect(
      ClaimSchema.safeParse({
        ...baseClaim,
        kind: 'metric',
        source: 'measured',
      }).success
    ).toBe(false);
    expect(
      ClaimSchema.safeParse({
        ...baseClaim,
        kind: 'metric',
        source: 'measured',
        citation: 'warehouse query fixture',
        validUntil: '2026-12-31',
      }).success
    ).toBe(true);
  });

  it('a comparison claim needs external evidence', () => {
    expect(
      ClaimSchema.safeParse({
        ...baseClaim,
        kind: 'comparison',
        source: 'entitlements',
        validUntil: '2026-12-31',
      }).success
    ).toBe(false);
  });

  it('offer claims must come from offer truth', () => {
    expect(
      ClaimSchema.safeParse({ ...baseClaim, kind: 'offer', source: 'feature' })
        .success
    ).toBe(false);
  });

  it('classifies known plan features and throws on unknown ones', () => {
    expect(classifyPlanFeature('Contact page')).toBe('artist-profiles');
    expect(classifyPlanFeature('Contact export')).toBe('fan-crm');
    expect(classifyPlanFeature('Ad pixel tracking')).toBe('ad-pixels');
    expect(() => classifyPlanFeature('Teleportation')).toThrow(
      /Unclassified plan feature/u
    );
  });

  it('slugifies claim segments deterministically', () => {
    expect(slugifyClaimSegment('Tips & payments')).toBe('tips-and-payments');
    expect(slugifyClaimSegment(' Subscribe / follow page ')).toBe(
      'subscribe-follow-page'
    );
  });
});
