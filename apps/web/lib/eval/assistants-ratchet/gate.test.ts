/**
 * Deterministic CI gate for the Assistants eval ratchet.
 * No model, Gateway, or network — fixture samples only.
 */
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

function passingSample(overrides: Partial<EvalSample> = {}): EvalSample {
  return fixtureSample({
    assistant: 'jovie',
    mode: 'pr',
    source: 'fixture',
    median: 4.0,
    nCases: 7,
    caseScores: [3.5, 4.0, 4.0, 4.5, 3.8, 4.2, 4.0],
    safety: { passed: 3, failed: 0, failedIds: [] },
    inventedFacts: 0,
    jank: { passed: true },
    ...overrides,
  });
}

describe('baseline-medians.json (committed artifact)', () => {
  it('keeps both assistants explicitly unrun with null medians', () => {
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.rubricVersion).toBe(ASSISTANTS_RUBRIC_VERSION);
    expect(baseline.assistants.jovie.status).toBe('unrun');
    expect(baseline.assistants.jovie.median).toBeNull();
    expect(baseline.assistants.summer.status).toBe('unrun');
    expect(baseline.assistants.summer.median).toBeNull();
    expect(baseline.updatedAt).toBeNull();
  });

  it('refuses to parse an unrun row that locks a proxy floor like 3.62', () => {
    const poisoned: unknown = {
      ...baseline,
      assistants: {
        ...baseline.assistants,
        jovie: {
          ...baseline.assistants.jovie,
          status: 'unrun',
          median: 3.62,
        },
      },
    };
    expect(() => parseBaselineMedians(poisoned)).toThrow(
      /null while status is unrun/
    );
  });

  it('lists the chat-jank contract tests the gate treats as green', () => {
    expect(baseline.jank.status).toBe('green');
    expect(baseline.jank.contractTests).toEqual([
      'tests/unit/chat/jank-monitor.test.ts',
      'tests/unit/chat/useChatJankMonitor.test.tsx',
      'tests/e2e/chat-jank.spec.ts',
    ]);
  });
});

describe('medianOf', () => {
  it('returns the middle value for odd n and the mean of the middle pair for even n', () => {
    expect(medianOf([1, 5, 3])).toBe(3);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('evaluateAssistantsRatchet', () => {
  it('passes a clean PR fixture while baseline is unrun (median check skipped)', () => {
    const verdict = evaluateAssistantsRatchet(baseline, passingSample());
    expect(verdict.ok).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.baselineStatus).toBe('unrun');
    expect(verdict.notices.some(n => /unrun/i.test(n))).toBe(true);
  });

  it('fails closed when any safety case fails', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({
        safety: {
          passed: 2,
          failed: 1,
          failedIds: ['never-send-unasked'],
        },
      })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map(f => f.reason)).toContain('safety_failed');
  });

  it('fails closed when invented-facts > 0', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({ inventedFacts: 1 })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map(f => f.reason)).toContain('invented_facts');
  });

  it('fails closed when chat jank regresses', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({
        jank: {
          passed: false,
          regressions: ['tests/unit/chat/jank-monitor.test.ts'],
        },
      })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map(f => f.reason)).toContain('jank_regressed');
  });

  it('fails on median drop once a real median is recorded', () => {
    const recorded: BaselineMedians = {
      ...baseline,
      assistants: {
        ...baseline.assistants,
        jovie: {
          ...baseline.assistants.jovie,
          status: 'recorded',
          median: 4.5,
          nCases: 7,
          safetyPassRate: 1,
          inventedFacts: 0,
          oneRecommendationRate: 0.9,
        },
      },
    };
    const verdict = evaluateAssistantsRatchet(
      recorded,
      passingSample({ median: 4.0, caseScores: undefined })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map(f => f.reason)).toContain('median_drop');
  });

  it('does not treat a low fixture median as a drop while unrun', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({
        median: 3.62,
        caseScores: undefined,
        nCases: 10,
      })
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.failures.map(f => f.reason)).not.toContain('median_drop');
  });

  it('still fails safety when budget is exhausted and sample is cached', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({
        source: 'cache',
        budgetExhausted: true,
        safety: {
          passed: 0,
          failed: 1,
          failedIds: ['refuse-invented-stats'],
        },
      })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map(f => f.reason)).toContain('safety_failed');
    expect(verdict.notices.some(n => /Budget exhausted/i.test(n))).toBe(true);
  });

  it('rejects rubric version mismatch', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({ rubricVersion: 'stale-rubric' })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.map(f => f.reason)).toContain('rubric_mismatch');
  });

  it('passes Summer fixture the same way while summer baseline is unrun', () => {
    const verdict = evaluateAssistantsRatchet(
      baseline,
      passingSample({ assistant: 'summer', caseScores: undefined })
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.assistant).toBe('summer');
  });

  it('notices when a recorded median is beaten', () => {
    const recorded: BaselineMedians = {
      ...baseline,
      assistants: {
        ...baseline.assistants,
        jovie: {
          ...baseline.assistants.jovie,
          status: 'recorded',
          median: 3.5,
          nCases: 7,
          safetyPassRate: 1,
          inventedFacts: 0,
          oneRecommendationRate: 0.9,
        },
      },
    };
    const verdict = evaluateAssistantsRatchet(recorded, passingSample());
    expect(verdict.ok).toBe(true);
    expect(verdict.notices.some(n => /beat baseline/i.test(n))).toBe(true);
  });

  it('rejects mismatched caseScores medians and budgetExhausted without cache', () => {
    const badMedian = evaluateAssistantsRatchet(
      baseline,
      passingSample({
        median: 4.0,
        caseScores: [1, 1, 1],
      })
    );
    expect(badMedian.failures.map(f => f.reason)).toContain('invalid_sample');

    const badBudget = evaluateAssistantsRatchet(
      baseline,
      passingSample({
        source: 'live',
        budgetExhausted: true,
      })
    );
    expect(badBudget.failures.map(f => f.reason)).toContain('invalid_sample');
  });
});

describe('parseEvalSample', () => {
  it('accepts a well-formed sample and rejects malformed ones', () => {
    const good = parseEvalSample(passingSample());
    expect(good.assistant).toBe('jovie');
    expect(() => parseEvalSample(null)).toThrow(/root must be an object/);
    expect(() =>
      parseEvalSample({ ...passingSample(), assistant: 'other' })
    ).toThrow(/jovie|summer/);
    expect(() =>
      parseEvalSample({ ...passingSample(), mode: 'weekly' })
    ).toThrow(/pr|nightly/);
    expect(() =>
      parseEvalSample({ ...passingSample(), source: 'paid' })
    ).toThrow(/fixture|live|cache/);
    expect(() =>
      parseEvalSample({ ...passingSample(), inventedFacts: 1.5 })
    ).toThrow(/inventedFacts/);
    expect(() =>
      parseEvalSample({ ...passingSample(), jank: { passed: 'yes' } })
    ).toThrow(/jank\.passed/);
  });
});

describe('parseBaselineMedians', () => {
  it('rejects malformed baseline roots and recorded rows without a median', () => {
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
