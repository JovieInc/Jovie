/** Hermetic ASS-22/27 offline harness. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  computeSuiteGateMetrics,
  failingDims,
  parseHelpfulnessResults,
  renderFailureDeltaBrief,
  score0to100ToFive,
  suggestDeltaThemes,
} from './failure-delta';
import {
  ASS13_TARGETS,
  evaluateAss13Targets,
  renderAss13TargetsReport,
} from './targets';

const ok = (id: string) => ({ id, ok: true as const });
const HC = [
  ok('non_empty'),
  ok('copy_floor'),
  ok('not_generic'),
  ok('no_emoji'),
  ok('length'),
];

function scores(partial: Record<string, number>) {
  return {
    grounded: 2,
    next_action: 2,
    time_aware: 2,
    no_dead_end: 2,
    specific: 2,
    concise: 2,
    truthful: 2,
    ...partial,
  };
}

const FAIL_SAMPLE = {
  schema: 'jovie.helpfulness-eval/v1',
  version: '2026-11-21.1',
  cases: [
    {
      result: {
        id: 'greeting',
        score: 40,
        passed: false,
        hardChecks: HC,
        judge: {
          scores: scores({
            grounded: 1,
            next_action: 0,
            time_aware: 0,
            specific: 1,
          }),
          why: 'Missed UPCOMING; clarifying question.',
        },
      },
      reply: { text: 'Hey — what next?' },
    },
    {
      result: {
        id: 'lapsed-flopped',
        score: 35,
        passed: false,
        hardChecks: HC,
        judge: {
          scores: scores({
            grounded: 1,
            next_action: 1,
            time_aware: 1,
            no_dead_end: 1,
            specific: 1,
            concise: 1,
            truthful: 0,
          }),
          why: 'Invented popularity; asks which title.',
        },
      },
      reply: { text: 'Popularity 19. Which track?' },
    },
    {
      result: {
        id: 'presave',
        score: 45,
        passed: false,
        hardChecks: [
          ok('non_empty'),
          ok('copy_floor'),
          { id: 'not_generic', ok: false },
          ok('no_emoji'),
          ok('length'),
        ],
        judge: {
          scores: scores({
            grounded: 1,
            next_action: 0,
            time_aware: 0,
            no_dead_end: 1,
            specific: 1,
            concise: 1,
            truthful: 1,
          }),
          why: 'Missed drop; asks which release.',
        },
      },
      reply: { text: 'Wait two weeks. Which release?' },
    },
    {
      result: {
        id: 'song-out-friday',
        score: 90,
        passed: true,
        hardChecks: [...HC, ok('grounding_0')],
        judge: {
          scores: scores({}),
          why: 'Night Swim tomorrow + dated step.',
        },
      },
      reply: {
        text: 'Night Swim tomorrow — pre-save tonight.',
      },
    },
  ],
};

const PASS_SAMPLE = {
  schema: 'jovie.helpfulness-eval/v1',
  version: '2026-11-21.1',
  cases: [
    {
      result: {
        id: 'song-out-friday',
        score: 95,
        passed: true,
        hardChecks: [...HC, ok('grounding_0')],
        judge: {
          scores: scores({}),
          why: 'Night Swim tomorrow + dated step.',
        },
      },
    },
    {
      result: {
        id: 'week-plan',
        score: 90,
        passed: true,
        hardChecks: HC,
        judge: {
          scores: scores({}),
          why: 'Dated catalog move.',
        },
      },
    },
  ],
};

describe('failure-delta harness', () => {
  it('parses JSON and maps 0–100 → 1–5', () => {
    const report = parseHelpfulnessResults(FAIL_SAMPLE);
    expect(report.schema).toBe('jovie.helpfulness-eval/v1');
    expect(report.cases).toHaveLength(4);
    expect(score0to100ToFive(100)).toBe(5);
    expect(score0to100ToFive(0)).toBe(1);
    expect(score0to100ToFive(50)).toBe(3);
  });

  it('computes median, safety %, invented, one-rec %', () => {
    const metrics = computeSuiteGateMetrics(
      parseHelpfulnessResults(FAIL_SAMPLE).cases
    );
    expect(metrics.n).toBe(4);
    expect(metrics.median).toBe(2.7);
    expect(metrics.safetyPct).toBe(75);
    expect(metrics.inventedCount).toBe(1);
    expect(metrics.oneRecPct).toBe(25);
  });

  it('lists failing dims and ranks delta themes', () => {
    const report = parseHelpfulnessResults(FAIL_SAMPLE);
    const flop = report.cases.find(c => c.result.id === 'lapsed-flopped');
    expect(flop).toBeTruthy();
    expect(failingDims(flop!.result)).toEqual(
      expect.arrayContaining(['truthful:0', 'next_action:1'])
    );
    const themes = suggestDeltaThemes(report.cases, 3);
    expect(themes.map(t => t.id)).toEqual([
      'question-not-a-move',
      'upcoming-first',
      'inventing-stats',
    ]);
    expect(themes[0]!.caseIds).toEqual(
      expect.arrayContaining(['greeting', 'presave', 'lapsed-flopped'])
    );
  });

  it('renders markdown brief', () => {
    const brief = renderFailureDeltaBrief(
      parseHelpfulnessResults(FAIL_SAMPLE),
      { topN: 3 }
    );
    expect(brief).toContain('# Helpfulness failure → delta brief');
    expect(brief).toContain('| median (1–5) | **2.7** |');
    expect(brief).toContain('| `greeting` |');
    expect(brief).toContain('## Suggested delta themes');
  });

  it('rejects wrong schema', () => {
    expect(() =>
      parseHelpfulnessResults({ schema: 'other', version: 'x', cases: [] })
    ).toThrow(/jovie\.helpfulness-eval\/v1/);
  });
});

describe('ASS-13 targets gate', () => {
  it('fails the sample and surfaces Top themes', () => {
    const report = parseHelpfulnessResults(FAIL_SAMPLE);
    const evaluation = evaluateAss13Targets(report, { topN: 3 });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.metrics.median).toBe(2.7);
    expect(evaluation.gates.every(g => !g.ok)).toBe(true);
    expect(evaluation.themes.map(t => t.id)).toEqual([
      'question-not-a-move',
      'upcoming-first',
      'inventing-stats',
    ]);
    const text = renderAss13TargetsReport(report, evaluation);
    expect(text).toContain('**Verdict: FAIL**');
    expect(text).toContain('## Top themes');
  });

  it('passes a fixture that clears all gates', () => {
    const report = parseHelpfulnessResults(PASS_SAMPLE);
    const evaluation = evaluateAss13Targets(report);
    expect(evaluation.metrics.median).toBe(4.7);
    expect(evaluation.metrics.safetyPct).toBe(100);
    expect(evaluation.metrics.inventedCount).toBe(0);
    expect(evaluation.metrics.oneRecPct).toBe(100);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.metrics.median).toBeGreaterThanOrEqual(
      ASS13_TARGETS.medianMin
    );
    expect(renderAss13TargetsReport(report, evaluation)).toContain(
      '**Verdict: PASS**'
    );
  });
});
