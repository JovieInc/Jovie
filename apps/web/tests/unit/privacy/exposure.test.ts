import { describe, expect, it } from 'vitest';
import {
  assertRemovalTransition,
  assertTelemetrySafeFinding,
  bindVerifiedSubject,
  canTransitionRemoval,
  detectRecurrence,
  type ExposureFinding,
  planExposureScan,
  redactSensitiveValue,
  selectRemediationPath,
} from '@/lib/privacy/exposure';

/**
 * Owner-authorized exposure protection contract (JOV-7141).
 *
 * Gates the canonical model: verified subject binding before any lookup,
 * redaction before telemetry, requested-vs-removed lifecycle, recurrence,
 * and cheapest-safe-path remediation routing.
 */

const VERIFIED = {
  subjectId: 'subj_1',
  verifiedAt: '2026-09-29T00:00:00Z',
  approvedIdentifierIds: ['id_phone', 'id_email'],
};

describe('bindVerifiedSubject', () => {
  it('rejects unverified subjects', () => {
    expect(() =>
      bindVerifiedSubject({ ...VERIFIED, verifiedAt: null })
    ).toThrow(/verified/);
  });

  it('rejects bindings with no approved identifiers', () => {
    expect(() =>
      bindVerifiedSubject({ ...VERIFIED, approvedIdentifierIds: [] })
    ).toThrow(/approved/);
  });

  it('binds a verified subject', () => {
    const binding = bindVerifiedSubject(VERIFIED);
    expect(binding.subjectId).toBe('subj_1');
    expect(binding.approvedIdentifierIds).toEqual(['id_phone', 'id_email']);
  });
});

describe('planExposureScan', () => {
  const binding = bindVerifiedSubject(VERIFIED);
  const identifiers = [
    { id: 'id_phone', category: 'phone' as const },
    { id: 'id_email', category: 'personal-email' as const },
  ];

  it('rejects identifiers the owner did not approve', () => {
    expect(() =>
      planExposureScan(
        binding,
        [...identifiers, { id: 'id_other', category: 'home-address' }],
        { providerSupportsHash: true }
      )
    ).toThrow(/not approved/);
  });

  it('prefers hashed lookup when the provider supports it', () => {
    const targets = planExposureScan(binding, identifiers, {
      providerSupportsHash: true,
    });
    expect(targets.every(t => t.lookup === 'hashed')).toBe(true);
  });

  it('falls back to raw lookup only when hashing is unsupported', () => {
    const targets = planExposureScan(binding, identifiers, {
      providerSupportsHash: false,
    });
    expect(targets.every(t => t.lookup === 'raw')).toBe(true);
  });
});

describe('redactSensitiveValue', () => {
  it('shows only the domain for emails', () => {
    expect(redactSensitiveValue('personal-email', 'me@example.com')).toBe(
      '•••@example.com'
    );
  });

  it('shows only the last digits for phones', () => {
    expect(redactSensitiveValue('phone', '+1 (415) 555-0132')).toBe(
      '••••••0132'
    );
  });
});

describe('assertTelemetrySafeFinding', () => {
  const base: ExposureFinding = {
    class: 'data-broker-listing',
    category: 'phone',
    redactedValue: '••••••0132',
    sourceId: 'broker-x',
    observedAt: '2026-09-29T00:00:00Z',
    confidence: 'verified',
    remediation: 'jovie-can-remove',
    removalState: 'not-requested',
  };

  it('accepts redacted findings', () => {
    expect(() => assertTelemetrySafeFinding(base)).not.toThrow();
  });

  it('rejects findings leaking a raw value', () => {
    expect(() =>
      assertTelemetrySafeFinding({
        ...base,
        redactedValue: '415-555-0132',
      })
    ).toThrow(/unredacted/);
  });
});

describe('removal lifecycle', () => {
  it('does not treat a sent request as removed', () => {
    expect(canTransitionRemoval('request-sent', 'removed')).toBe(false);
    expect(() => assertRemovalTransition('request-sent', 'removed')).toThrow(
      /invalid removal transition/
    );
  });

  it('allows the verified happy path', () => {
    expect(canTransitionRemoval('not-requested', 'request-sent')).toBe(true);
    expect(canTransitionRemoval('request-sent', 'provider-acknowledged')).toBe(
      true
    );
    expect(canTransitionRemoval('provider-acknowledged', 'pending')).toBe(true);
    expect(canTransitionRemoval('pending', 'removed')).toBe(true);
  });

  it('detects recurrence only after verified removal', () => {
    expect(
      detectRecurrence('removed', {
        sourceSeenAgain: true,
        observedAt: '2026-10-01T00:00:00Z',
      })
    ).toBe('recurred');
    expect(
      detectRecurrence('pending', {
        sourceSeenAgain: true,
        observedAt: '2026-10-01T00:00:00Z',
      })
    ).toBe('pending');
    expect(canTransitionRemoval('recurred', 'request-sent')).toBe(true);
  });
});

describe('selectRemediationPath', () => {
  const candidates = [
    {
      path: 'vendor-agent' as const,
      providerId: 'vendor-a',
      fullyLoadedCostCents: 200,
      requiresOwnerConsent: false,
      supportsVerification: true,
    },
    {
      path: 'first-party-api' as const,
      providerId: 'source-x',
      fullyLoadedCostCents: 900,
      requiresOwnerConsent: false,
      supportsVerification: true,
    },
    {
      path: 'automated-form' as const,
      providerId: 'former',
      fullyLoadedCostCents: 50,
      requiresOwnerConsent: true,
      supportsVerification: false,
    },
  ];

  it('prefers the safest path class over a cheaper less-safe path', () => {
    const decision = selectRemediationPath(candidates, {
      ownerConsentGranted: true,
    });
    expect(decision.path).toBe('first-party-api');
    expect(decision.providerId).toBe('source-x');
  });

  it('excludes consent-gated paths when consent is not granted', () => {
    const decision = selectRemediationPath(
      [
        {
          path: 'automated-form',
          providerId: 'former',
          fullyLoadedCostCents: 50,
          requiresOwnerConsent: true,
          supportsVerification: false,
        },
        {
          path: 'vendor-agent',
          providerId: 'vendor-a',
          fullyLoadedCostCents: 500,
          requiresOwnerConsent: false,
          supportsVerification: true,
        },
      ],
      { ownerConsentGranted: false }
    );
    expect(decision.providerId).toBe('vendor-a');
  });

  it('returns no-action when every path requires consent', () => {
    const decision = selectRemediationPath(
      [
        {
          path: 'human-handoff',
          providerId: 'agent-1',
          fullyLoadedCostCents: 0,
          requiresOwnerConsent: true,
          supportsVerification: false,
        },
      ],
      { ownerConsentGranted: false }
    );
    expect(decision.path).toBe('no-action');
    expect(decision.providerId).toBeNull();
  });
});
