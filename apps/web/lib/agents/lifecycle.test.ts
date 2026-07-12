import { describe, expect, it } from 'vitest';
import {
  assertSkillLifecycleTransition,
  canTransitionSkillLifecycle,
  DEFAULT_SKILL_LIFECYCLE,
  DEFAULT_SKILL_VERSION,
  gateSkillInvocation,
  normalizeSkillLifecycleState,
  resolveSkillVersion,
  rollbackSkillActiveVersion,
  SKILL_DISABLED_USER_MESSAGE,
  SKILL_LIFECYCLE_TRANSITIONS,
  SKILL_LIFECYCLES,
  type SkillLifecycle,
} from './lifecycle';

describe('skill lifecycle transitions', () => {
  it('defines a next-state map for every lifecycle', () => {
    for (const state of SKILL_LIFECYCLES) {
      expect(SKILL_LIFECYCLE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it.each([
    ['draft', 'dogfood'],
    ['dogfood', 'cohort'],
    ['cohort', 'ga'],
    ['ga', 'deprecated'],
    ['ga', 'disabled'],
    ['disabled', 'draft'],
    ['deprecated', 'ga'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransitionSkillLifecycle(from, to)).toBe(true);
    expect(() => assertSkillLifecycleTransition(from, to)).not.toThrow();
  });

  it.each([
    ['draft', 'ga'],
    ['draft', 'cohort'],
    ['dogfood', 'ga'],
    ['ga', 'draft'],
    ['disabled', 'ga'],
    ['cohort', 'draft'],
  ] as const)('rejects illegal %s → %s', (from, to) => {
    expect(canTransitionSkillLifecycle(from, to)).toBe(false);
    expect(() => assertSkillLifecycleTransition(from, to)).toThrow(
      /Illegal skill lifecycle transition/
    );
  });

  it('treats same-state as a no-op legal transition', () => {
    for (const state of SKILL_LIFECYCLES) {
      expect(canTransitionSkillLifecycle(state, state)).toBe(true);
    }
  });
});

describe('resolveSkillVersion', () => {
  it('uses activeVersion by default', () => {
    expect(
      resolveSkillVersion({
        lifecycle: 'ga',
        version: '1.2.0',
        activeVersion: '1.1.0',
        availableVersions: ['1.0.0', '1.1.0', '1.2.0'],
      })
    ).toBe('1.1.0');
  });

  it('honors preferredVersion only in dogfood/cohort', () => {
    const base = {
      version: '2.0.0',
      activeVersion: '1.0.0',
      availableVersions: ['1.0.0', '2.0.0'] as const,
      preferredVersion: '2.0.0',
    };
    expect(resolveSkillVersion({ ...base, lifecycle: 'cohort' })).toBe('2.0.0');
    expect(resolveSkillVersion({ ...base, lifecycle: 'dogfood' })).toBe(
      '2.0.0'
    );
    expect(resolveSkillVersion({ ...base, lifecycle: 'ga' })).toBe('1.0.0');
  });

  it('falls back to content version when activeVersion is missing from available', () => {
    expect(
      resolveSkillVersion({
        lifecycle: 'ga',
        version: '3.0.0',
        activeVersion: '9.9.9',
        availableVersions: ['3.0.0'],
      })
    ).toBe('3.0.0');
  });
});

describe('gateSkillInvocation', () => {
  it('blocks disabled skills with a graceful in-product message', () => {
    const gate = gateSkillInvocation({
      lifecycle: 'disabled',
      version: '1.0.0',
      activeVersion: '1.0.0',
    });
    expect(gate).toEqual({
      ok: false,
      reason: 'disabled',
      message: SKILL_DISABLED_USER_MESSAGE,
      lifecycle: 'disabled',
    });
  });

  it('allows ga/dogfood/cohort/draft/deprecated invocations', () => {
    const lifecycles: SkillLifecycle[] = [
      'draft',
      'dogfood',
      'cohort',
      'ga',
      'deprecated',
    ];
    for (const lifecycle of lifecycles) {
      const gate = gateSkillInvocation({
        lifecycle,
        version: '1.0.0',
        activeVersion: '1.0.0',
      });
      expect(gate.ok).toBe(true);
      if (gate.ok) {
        expect(gate.version).toBe('1.0.0');
      }
    }
  });
});

describe('rollbackSkillActiveVersion', () => {
  it('flips activeVersion without changing lifecycle', () => {
    const next = rollbackSkillActiveVersion(
      { lifecycle: 'ga', version: '2.0.0', activeVersion: '2.0.0' },
      '1.0.0',
      ['1.0.0', '2.0.0']
    );
    expect(next).toEqual({
      lifecycle: 'ga',
      version: '2.0.0',
      activeVersion: '1.0.0',
    });
  });

  it('rejects unknown target versions', () => {
    expect(() =>
      rollbackSkillActiveVersion(
        { lifecycle: 'ga', version: '2.0.0', activeVersion: '2.0.0' },
        '0.0.1',
        ['1.0.0', '2.0.0']
      )
    ).toThrow(/unknown version/);
  });
});

describe('normalizeSkillLifecycleState', () => {
  it('backfills missing columns as ga/1.0.0 (migration-drift fail-soft)', () => {
    expect(normalizeSkillLifecycleState({})).toEqual({
      version: DEFAULT_SKILL_VERSION,
      activeVersion: DEFAULT_SKILL_VERSION,
      lifecycle: DEFAULT_SKILL_LIFECYCLE,
    });
  });

  it('preserves valid lifecycle and activeVersion', () => {
    expect(
      normalizeSkillLifecycleState({
        version: '2.1.0',
        activeVersion: '2.0.0',
        lifecycle: 'cohort',
      })
    ).toEqual({
      version: '2.1.0',
      activeVersion: '2.0.0',
      lifecycle: 'cohort',
    });
  });

  it('treats unknown lifecycle strings as ga', () => {
    expect(
      normalizeSkillLifecycleState({
        version: '1.0.0',
        lifecycle: 'not-a-state',
      }).lifecycle
    ).toBe('ga');
  });
});
