import { describe, expect, it } from 'vitest';
import { validateOptimizationDecision } from '@/lib/optimization/decision';

const valid = {
  status: 'running' as const,
  objective: 'watch_time_per_impression',
  guardrails: { minRetentionSeconds: 30 },
  variants: [{ key: 'original' }, { key: 'candidate-a' }],
  winnerVariantKey: 'candidate-a',
  evidence: {
    sampleSize: 10_000,
    minimumSampleSize: 5_000,
    windowStart: new Date('2026-08-01T00:00:00.000Z'),
    windowEnd: new Date('2026-08-28T00:00:00.000Z'),
  },
  acceptedBy: 'user-1',
};

describe('continuous optimization decision gate', () => {
  it('requires a locked objective, guardrails, evidence, and acceptance', () => {
    expect(validateOptimizationDecision(valid)).toEqual({ ok: true });
    expect(validateOptimizationDecision({ ...valid, guardrails: {} })).toEqual({
      ok: false,
      reason: 'guardrails_missing',
    });
    expect(
      validateOptimizationDecision({ ...valid, acceptedBy: null })
    ).toEqual({ ok: false, reason: 'acceptance_missing' });
  });

  it('rejects an underpowered winner', () => {
    expect(
      validateOptimizationDecision({
        ...valid,
        evidence: { ...valid.evidence, sampleSize: 4999 },
      })
    ).toEqual({ ok: false, reason: 'sample_insufficient' });
  });

  it('rejects winner decisions unless the experiment is running', () => {
    expect(
      validateOptimizationDecision({ ...valid, status: 'paused' })
    ).toEqual({
      ok: false,
      reason: 'experiment_not_running',
    });
  });
});
