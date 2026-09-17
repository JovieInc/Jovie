import { describe, expect, it } from 'vitest';
import {
  buildJevDecisionState,
  buildJevQuestions,
  CONFLICT_FX_DECISION_MODEL,
  CONFLICT_FX_JEV_DECISION_SCHEMA,
  interpretJevDecision,
  JEV_GENERATIVE_STRATEGY,
  runJevDecision,
} from '../conflict-fx-jev-decision.mjs';

function jevAnswers(overrides = {}) {
  return {
    strategy: { choice: JEV_GENERATIVE_STRATEGY, confidence: 0.9 },
    safeToAttempt: { probability: 0.9 },
    risk: { score: 1 },
    ...overrides,
  };
}

describe('conflict FX Jev decision gate', () => {
  it('exposes the gateway Jev model and typed schema', () => {
    expect(CONFLICT_FX_DECISION_MODEL).toBe('typesafe-ai/jev');
    expect(CONFLICT_FX_JEV_DECISION_SCHEMA).toMatch(/jev-decision\/v1$/);
    const questions = buildJevQuestions();
    expect(questions.strategy.type).toBe('choice');
    expect(questions.safeToAttempt.type).toBe('boolean');
    expect(questions.risk.type).toBe('score');
  });

  it('builds decision state from planner metadata without file contents', () => {
    const state = buildJevDecisionState({
      prNumber: 7,
      attempt: 1,
      conflictFiles: ['apps/web/lib/a.ts'],
      competingChanges: [{ file: 'apps/web/lib/a.ts' }],
    });
    expect(state).toEqual({
      prNumber: 7,
      attempt: 1,
      maxAttempts: 2,
      conflictFiles: ['apps/web/lib/a.ts'],
      competingChanges: [{ file: 'apps/web/lib/a.ts' }],
    });
    expect(JSON.stringify(state)).not.toContain('diff');
  });

  it('approves the generative strategy only at low risk and high safety', () => {
    expect(interpretJevDecision(jevAnswers()).proceed).toBe(true);
    expect(
      interpretJevDecision(
        jevAnswers({ strategy: { choice: 'mechanical-theirs' } })
      ).proceed
    ).toBe(false);
    expect(
      interpretJevDecision(jevAnswers({ risk: { score: 3 } })).proceed
    ).toBe(false);
    expect(
      interpretJevDecision(jevAnswers({ safeToAttempt: { probability: 0.5 } }))
        .proceed
    ).toBe(false);
  });

  it('fails closed on missing or malformed answers', () => {
    expect(interpretJevDecision(undefined).proceed).toBe(false);
    expect(interpretJevDecision({}).proceed).toBe(false);
    expect(
      interpretJevDecision(
        jevAnswers({ strategy: { choice: null }, risk: {}, safeToAttempt: {} })
      ).proceed
    ).toBe(false);
    const closed = interpretJevDecision({});
    expect(closed.reason).toContain('missing or malformed strategy answer');
  });

  it('runs the injected evaluate implementation and reports the gate', async () => {
    const seen = [];
    const decision = await runJevDecision({
      state: buildJevDecisionState({ prNumber: 1, attempt: 1 }),
      evaluate: async args => {
        seen.push(args);
        return { answers: jevAnswers() };
      },
    });
    expect(seen[0].model).toBe('typesafe-ai/jev');
    expect(seen[0].questions.strategy.type).toBe('choice');
    expect(decision.proceed).toBe(true);
    expect(decision.schema).toBe(CONFLICT_FX_JEV_DECISION_SCHEMA);
  });

  it('defers when the injected evaluate implementation throws', async () => {
    await expect(
      runJevDecision({
        state: {},
        evaluate: async () => {
          throw new Error('gateway down');
        },
      })
    ).rejects.toThrow('gateway down');
  });
});
