import { describe, expect, it } from 'vitest';
import {
  buildRatchetUpdate,
  compareRatchet,
  isLooseningBaseline,
  RATCHET_CORE_SCHEMA_VERSION,
  RATCHET_DIRECTIONS,
  validateRatchetConfig,
} from '../ratchet-core.mjs';

const ratchet = overrides => ({
  schemaVersion: RATCHET_CORE_SCHEMA_VERSION,
  dimension: 'metric',
  direction: RATCHET_DIRECTIONS.LOCK_DOWN,
  baseline: 900,
  sampleSize: 50,
  policy: { marginFraction: 0.2, improveEpsilon: 0.02, minSampleSize: 0 },
  ...overrides,
});

describe('ratchet core validation', () => {
  it('accepts lock_down/lock_up configs and rejects invalid shape', () => {
    expect(validateRatchetConfig(ratchet()).ok).toBe(true);
    expect(
      validateRatchetConfig(ratchet({ direction: RATCHET_DIRECTIONS.LOCK_UP }))
        .ok
    ).toBe(true);
    expect(validateRatchetConfig(null).ok).toBe(false);
    expect(validateRatchetConfig(ratchet({ direction: 'sideways' })).ok).toBe(
      false
    );
  });
});

describe('compareRatchet', () => {
  it('lock_down passes within ceiling, fails above it, and proposes tighter baseline', () => {
    expect(compareRatchet(895, ratchet())).toMatchObject({
      ok: true,
      status: 'pass',
      threshold: 1080,
      headroom: 185,
    });
    expect(compareRatchet(1100, ratchet())).toMatchObject({
      ok: false,
      status: 'regression',
      headroom: -20,
    });
    expect(compareRatchet(800, ratchet())).toMatchObject({
      ok: true,
      status: 'improvement',
      proposeNewBaseline: 800,
    });
  });

  it('lock_up passes above floor, fails below it, and improves above baseline', () => {
    const lockUp = ratchet({
      direction: RATCHET_DIRECTIONS.LOCK_UP,
      baseline: 6,
      policy: { marginFraction: 0.25, improveEpsilon: 0.02, minSampleSize: 0 },
    });
    expect(compareRatchet(5, lockUp)).toMatchObject({
      ok: true,
      status: 'pass',
      threshold: 4.5,
      headroom: 0.5,
    });
    expect(compareRatchet(4, lockUp)).toMatchObject({
      ok: false,
      status: 'regression',
      headroom: -0.5,
    });
    expect(compareRatchet(8, lockUp)).toMatchObject({
      ok: true,
      status: 'improvement',
      proposeNewBaseline: 8,
    });
  });

  it('supports minSampleSize and expiring waivers', () => {
    const policy = { ...ratchet().policy, minSampleSize: 20 };
    expect(
      compareRatchet({ value: 5000, sampleSize: 3 }, ratchet({ policy }))
    ).toMatchObject({ ok: true, status: 'insufficient_data' });
    expect(
      compareRatchet({ value: 5000, sampleSize: 25 }, ratchet({ policy }))
    ).toMatchObject({ ok: false, status: 'regression' });
    expect(
      compareRatchet(
        5000,
        ratchet({
          policy: {
            ...ratchet().policy,
            waiver: { until: '2999-01-01T00:00:00Z' },
          },
        })
      )
    ).toMatchObject({ ok: true, status: 'waived' });
  });
});

describe('baseline updates', () => {
  it('detects loosening per direction and refuses it unless forced', () => {
    const lockUp = ratchet({
      direction: RATCHET_DIRECTIONS.LOCK_UP,
      baseline: 6,
    });
    expect(isLooseningBaseline(950, ratchet())).toBe(true);
    expect(isLooseningBaseline(850, ratchet())).toBe(false);
    expect(isLooseningBaseline(5, lockUp)).toBe(true);
    expect(isLooseningBaseline(7, lockUp)).toBe(false);
    expect(
      buildRatchetUpdate(ratchet(), { value: 800, sampleSize: 40 })
    ).toMatchObject({
      ok: true,
      updated: { baseline: 800, sampleSize: 40 },
    });
    expect(buildRatchetUpdate(ratchet(), { value: 1000 })).toMatchObject({
      ok: false,
      updated: null,
    });
    expect(
      buildRatchetUpdate(lockUp, { value: 5 }, { force: true })
    ).toMatchObject({ ok: true, updated: { baseline: 5 } });
  });
});
