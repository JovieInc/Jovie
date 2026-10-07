import { describe, expect, it } from 'vitest';
import {
  evaluatePresenceChecks,
  isPresenceObservationStale,
  PRESENCE_STALE_AFTER_MS,
} from './evidence';
import type { PresenceCheckEvidence } from './types';

const now = new Date('2026-10-06T12:00:00Z');
const unconfigured: PresenceCheckEvidence = {
  state: 'unconfigured',
  reason: 'No source.',
};
const measured = (
  outcome: 'pass' | 'warn' | 'fail',
  age = 0
): PresenceCheckEvidence => ({
  state: 'measured',
  outcome,
  checkedAt: new Date(now.getTime() - age).toISOString(),
  summary: 'Actual measured value',
});

describe.each(['creator', 'company'])('shared %s evidence policy', target => {
  const checks = (values: PresenceCheckEvidence[]) =>
    values.map((evidence, i) => ({ label: `${target} check ${i}`, evidence }));
  it('keeps four unconfigured checks neutral and never declares them healthy', () => {
    const status = evaluatePresenceChecks(
      checks(Array.from({ length: 4 }, () => unconfigured)),
      now
    );
    expect(status.label).toBe('Unconfigured');
    expect(status.tone).toBe('neutral');
    expect(status.needsAttention).toBe(false);
  });
  it('reports partial evidence, then prioritizes warning and failure over passing checks', () => {
    expect(
      evaluatePresenceChecks(checks([measured('pass'), unconfigured]), now)
        .label
    ).toBe('Partially Measured');
    expect(
      evaluatePresenceChecks(checks([measured('pass'), measured('warn')]), now)
        .label
    ).toBe('Needs Attention');
    expect(
      evaluatePresenceChecks(checks([measured('warn'), measured('fail')]), now)
        .tone
    ).toBe('error');
  });
  it('requires measured current evidence for health and keeps the established two-week cutoff', () => {
    expect(
      evaluatePresenceChecks(
        checks([measured('pass', PRESENCE_STALE_AFTER_MS)]),
        now
      ).label
    ).toBe('Healthy');
    expect(
      evaluatePresenceChecks(
        checks([measured('pass', PRESENCE_STALE_AFTER_MS + 1)]),
        now
      ).label
    ).toBe('Stale');
    expect(isPresenceObservationStale(undefined, now)).toBe(false);
  });
});
