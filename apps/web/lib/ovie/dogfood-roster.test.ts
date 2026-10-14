import { describe, expect, it } from 'vitest';
import {
  type DogfooderUpsert,
  DogfoodRosterConflictError,
  dogfooderUpsertSchema,
  evaluateDogfoodExposure,
  normalizeDogfooderUpsert,
} from './dogfood-roster';

const now = new Date('2026-10-14T05:00:00.000Z');
const calibrated = {
  knownGoodPassed: true,
  knownBrokenPassed: true,
  actionableReports: 2,
  feedbackQualityScore: 0.8,
  completedAt: now.toISOString(),
};

function input(overrides: Partial<DogfooderUpsert> = {}): DogfooderUpsert {
  const base = dogfooderUpsertSchema.parse({
    actorKey: 'human:one',
    actorKind: 'external_human',
    displayName: 'Human One',
    tier: 'alpha',
    products: ['jov', 'lyb'],
    consent: {
      grantedAt: now.toISOString(),
      scope: ['dogfood'],
      source: 'direct',
      revokedAt: null,
    },
    signalState: 'consented',
  });
  return { ...base, ...overrides };
}

describe('dogfood signal lifecycle', () => {
  it('enforces progression, calibration, and terminal retirement', () => {
    expect(normalizeDogfooderUpsert('invited', input()).signalState).toBe(
      'consented'
    );
    expect(() =>
      normalizeDogfooderUpsert(
        'invited',
        input({ signalState: 'qualified', calibration: calibrated })
      )
    ).toThrow(DogfoodRosterConflictError);
    expect(
      normalizeDogfooderUpsert(
        'calibrating',
        input({ signalState: 'qualified', calibration: calibrated })
      ).signalState
    ).toBe('qualified');
    expect(() =>
      normalizeDogfooderUpsert('retired', input({ signalState: 'consented' }))
    ).toThrow(/retired -> consented/);
    expect(
      normalizeDogfooderUpsert(
        'consented',
        input({ tier: 'advisor', vouchedBy: 'tim', signalState: 'qualified' })
      ).signalState
    ).toBe('qualified');
    const consent = { ...input().consent, revokedAt: now.toISOString() };
    expect(
      normalizeDogfooderUpsert(
        'qualified',
        input({ consent, signalState: 'qualified' })
      ).signalState
    ).toBe('paused');
  });
});

const member = {
  id: 'member-1',
  actorKey: 'human:one',
  products: ['jov', 'lyb'] as const,
  scopes: ['approved_internal_features'],
  allowedModes: ['customer_control', 'early_access'] as const,
  signalState: 'qualified' as const,
  consent: {
    grantedAt: '2026-10-01T00:00:00.000Z',
    scope: ['dogfood'],
    source: 'direct',
    revokedAt: null,
  },
  membershipExpiresAt: null,
};
const binding = {
  id: 'binding-1',
  status: 'active' as const,
  expiresAt: new Date('2026-10-15T00:00:00.000Z'),
  revokedAt: null,
};
const exposure = {
  membership: member,
  binding,
  product: 'jov' as const,
  mode: 'early_access' as const,
  requestedScopes: ['approved_internal_features'],
  now,
};

describe('effective dogfood exposure', () => {
  it('is deterministic, preserves safety controls, and keeps customer mode independent', () => {
    const first = evaluateDogfoodExposure(exposure);
    expect(evaluateDogfoodExposure(exposure)).toEqual(first);
    expect(first).toMatchObject({
      eligible: true,
      expected: { product: 'jov', mode: 'early_access' },
      preserves: { killSwitches: true, permissions: true, entitlements: true },
    });
    expect(
      evaluateDogfoodExposure({
        ...exposure,
        product: 'lyb',
        mode: 'customer_control',
        requestedScopes: ['not_granted'],
      })
    ).toMatchObject({ eligible: true, expected: { scopes: [] } });
    expect(
      evaluateDogfoodExposure({
        ...exposure,
        requestedScopes: ['not_granted'],
      })
    ).toMatchObject({ eligible: false, reason: 'unauthorized_scope' });
    expect(
      evaluateDogfoodExposure({
        ...exposure,
        binding: { ...binding, expiresAt: new Date('2026-10-13') },
      })
    ).toMatchObject({ eligible: false, reason: 'stale_binding' });
    const membership = {
      ...member,
      membershipExpiresAt: new Date('2026-10-13'),
    };
    expect(evaluateDogfoodExposure({ ...exposure, membership })).toMatchObject({
      eligible: false,
      reason: 'stale_membership',
      repair: { owner: 'summer', action: 'refresh_membership' },
    });
  });
});
