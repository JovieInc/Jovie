/** Assistants CI ratchet — hermetic baselines. */
import { describe, expect, it } from 'vitest';
import {
  ASSISTANTS_RUBRIC_VERSION,
  type BaselineMedians,
  type EvalSample,
  evaluateAssistantsRatchet,
  fixtureSample,
  loadBaselineMedians,
  medianOf,
  parseBaselineMedians,
  parseEvalSample,
} from './index';

const baseline = loadBaselineMedians();
const sample = (o: Partial<EvalSample> = {}): EvalSample =>
  fixtureSample({
    assistant: 'jovie',
    mode: 'pr',
    source: 'fixture',
    median: 4.0,
    nCases: 7,
    caseScores: [3.5, 4.0, 4.0, 4.5, 3.8, 4.2, 4.0],
    safety: { passed: 3, failed: 0, failedIds: [] },
    inventedFacts: 0,
    jank: { passed: true },
    ...o,
  });
const reasons = (v: { failures: readonly { reason: string }[] }) =>
  v.failures.map(f => f.reason);
const recorded = (median: number): BaselineMedians => ({
  ...baseline,
  assistants: {
    ...baseline.assistants,
    jovie: {
      ...baseline.assistants.jovie,
      status: 'recorded',
      median,
      nCases: 7,
      safetyPassRate: 1,
      inventedFacts: 0,
      oneRecommendationRate: 0.9,
    },
  },
});

describe('baseline-medians.json', () => {
  it('keeps both assistants unrun with null medians', () => {
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.rubricVersion).toBe(ASSISTANTS_RUBRIC_VERSION);
    expect(baseline.assistants.jovie.status).toBe('unrun');
    expect(baseline.assistants.jovie.median).toBeNull();
    expect(baseline.assistants.summer.status).toBe('unrun');
    expect(baseline.assistants.summer.median).toBeNull();
    expect(baseline.updatedAt).toBeNull();
  });
  it('refuses unrun rows that lock a proxy floor like 3.62', () => {
    const poisoned: unknown = {
      ...baseline,
      assistants: {
        ...baseline.assistants,
        jovie: { ...baseline.assistants.jovie, status: 'unrun', median: 3.62 },
      },
    };
    expect(() => parseBaselineMedians(poisoned)).toThrow(
      /null while status is unrun/
    );
  });
  it('lists chat-jank contract tests as green', () => {
    expect(baseline.jank.status).toBe('green');
    expect(baseline.jank.contractTests).toEqual([
      'tests/unit/chat/jank-monitor.test.ts',
      'tests/unit/chat/useChatJankMonitor.test.tsx',
      'tests/e2e/chat-jank.spec.ts',
    ]);
  });
});

describe('medianOf', () => {
  it('odd middle / even mean of middle pair', () => {
    expect(medianOf([1, 5, 3])).toBe(3);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('evaluateAssistantsRatchet', () => {
  it('passes clean PR fixture while unrun', () => {
    const v = evaluateAssistantsRatchet(baseline, sample());
    expect(v.ok).toBe(true);
    expect(v.failures).toEqual([]);
    expect(v.baselineStatus).toBe('unrun');
    expect(v.notices.some(n => /unrun/i.test(n))).toBe(true);
  });
  it('fails closed on safety / invented-facts / jank', () => {
    expect(
      reasons(
        evaluateAssistantsRatchet(
          baseline,
          sample({
            safety: { passed: 2, failed: 1, failedIds: ['never-send-unasked'] },
          })
        )
      )
    ).toContain('safety_failed');
    expect(
      reasons(evaluateAssistantsRatchet(baseline, sample({ inventedFacts: 1 })))
    ).toContain('invented_facts');
    expect(
      reasons(
        evaluateAssistantsRatchet(
          baseline,
          sample({
            jank: {
              passed: false,
              regressions: ['tests/unit/chat/jank-monitor.test.ts'],
            },
          })
        )
      )
    ).toContain('jank_regressed');
  });
  it('median drop only after recorded; unrun skips drop', () => {
    expect(
      reasons(
        evaluateAssistantsRatchet(
          recorded(4.5),
          sample({ median: 4.0, caseScores: undefined })
        )
      )
    ).toContain('median_drop');
    const unrun = evaluateAssistantsRatchet(
      baseline,
      sample({ median: 3.62, caseScores: undefined, nCases: 10 })
    );
    expect(unrun.ok).toBe(true);
    expect(reasons(unrun)).not.toContain('median_drop');
  });
  it('budget-exhausted cache still fails safety; live+exhausted invalid', () => {
    const v = evaluateAssistantsRatchet(
      baseline,
      sample({
        source: 'cache',
        budgetExhausted: true,
        safety: { passed: 0, failed: 1, failedIds: ['refuse-invented-stats'] },
      })
    );
    expect(reasons(v)).toContain('safety_failed');
    expect(v.notices.some(n => /Budget exhausted/i.test(n))).toBe(true);
    expect(
      reasons(
        evaluateAssistantsRatchet(
          baseline,
          sample({ source: 'live', budgetExhausted: true })
        )
      )
    ).toContain('invalid_sample');
  });
  it('rubric mismatch / summer unrun / beat baseline / bad caseScores', () => {
    expect(
      reasons(
        evaluateAssistantsRatchet(
          baseline,
          sample({ rubricVersion: 'stale-rubric' })
        )
      )
    ).toContain('rubric_mismatch');
    const summer = evaluateAssistantsRatchet(
      baseline,
      sample({ assistant: 'summer', caseScores: undefined })
    );
    expect(summer.ok).toBe(true);
    expect(summer.assistant).toBe('summer');
    expect(
      evaluateAssistantsRatchet(recorded(3.5), sample()).notices.some(n =>
        /beat baseline/i.test(n)
      )
    ).toBe(true);
    expect(
      reasons(
        evaluateAssistantsRatchet(
          baseline,
          sample({ median: 4.0, caseScores: [1, 1, 1] })
        )
      )
    ).toContain('invalid_sample');
  });
});

describe('parseEvalSample', () => {
  it('accepts well-formed and rejects malformed', () => {
    expect(parseEvalSample(sample()).assistant).toBe('jovie');
    expect(() => parseEvalSample(null)).toThrow(/root must be an object/);
    expect(() => parseEvalSample({ ...sample(), assistant: 'other' })).toThrow(
      /jovie|summer/
    );
    expect(() => parseEvalSample({ ...sample(), mode: 'weekly' })).toThrow(
      /pr|nightly/
    );
    expect(() => parseEvalSample({ ...sample(), source: 'paid' })).toThrow(
      /fixture|live|cache/
    );
    expect(() => parseEvalSample({ ...sample(), inventedFacts: 1.5 })).toThrow(
      /inventedFacts/
    );
    expect(() =>
      parseEvalSample({ ...sample(), jank: { passed: 'yes' } })
    ).toThrow(/jank\.passed/);
  });
});

describe('parseBaselineMedians', () => {
  it('rejects malformed roots and recorded-without-median', () => {
    expect(() => parseBaselineMedians(null)).toThrow(/root must be an object/);
    expect(() =>
      parseBaselineMedians({ ...baseline, schemaVersion: 99 })
    ).toThrow(/schemaVersion/);
    expect(() =>
      parseBaselineMedians({
        ...baseline,
        assistants: {
          ...baseline.assistants,
          jovie: {
            ...baseline.assistants.jovie,
            status: 'recorded',
            median: null,
          },
        },
      })
    ).toThrow(/median must be a finite number when recorded/);
  });
});
