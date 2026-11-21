/**
 * Hermetic tests for the offline failure→delta harness. No model or network.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = JSON.parse(
  readFileSync(join(HERE, 'fixtures/failure-delta-sample.json'), 'utf8')
) as unknown;

describe('failure-delta harness', () => {
  it('parses eval:helpfulness --out JSON and maps 0–100 → 1–5', () => {
    const report = parseHelpfulnessResults(SAMPLE);
    expect(report.schema).toBe('jovie.helpfulness-eval/v1');
    expect(report.cases).toHaveLength(4);
    expect(score0to100ToFive(100)).toBe(5);
    expect(score0to100ToFive(0)).toBe(1);
    expect(score0to100ToFive(50)).toBe(3);
  });

  it('computes median, safety %, invented count, and one-rec %', () => {
    const report = parseHelpfulnessResults(SAMPLE);
    const metrics = computeSuiteGateMetrics(report.cases);
    expect(metrics.n).toBe(4);
    // scores 40,35,45,90 → 1–5: 2.6, 2.4, 2.8, 4.6 → median (2.6+2.8)/2 = 2.7
    expect(metrics.median).toBe(2.7);
    // 3/4 hard-pass; only presave fails not_generic
    expect(metrics.safetyPct).toBe(75);
    expect(metrics.inventedCount).toBe(1);
    // 1 of 4 judged cases has next_action === 2
    expect(metrics.oneRecPct).toBe(25);
  });

  it('lists failing dims and ranks known delta themes', () => {
    const report = parseHelpfulnessResults(SAMPLE);
    const flop = report.cases.find(c => c.result.id === 'lapsed-flopped');
    expect(flop).toBeTruthy();
    expect(failingDims(flop!.result)).toEqual(
      expect.arrayContaining(['truthful:0', 'next_action:1'])
    );

    const themes = suggestDeltaThemes(report.cases, 3);
    // question closers hit 3 cases; upcoming-first 2; inventing-stats 1
    expect(themes.map(t => t.id)).toEqual([
      'question-not-a-move',
      'upcoming-first',
      'inventing-stats',
    ]);
    expect(themes[0]!.caseIds).toEqual(
      expect.arrayContaining(['greeting', 'presave', 'lapsed-flopped'])
    );
    expect(themes.find(t => t.id === 'inventing-stats')?.caseIds).toEqual([
      'lapsed-flopped',
    ]);
  });

  it('renders a markdown brief with gate table and failing cases', () => {
    const report = parseHelpfulnessResults(SAMPLE);
    const brief = renderFailureDeltaBrief(report, { topN: 3 });
    expect(brief).toContain('# Helpfulness failure → delta brief');
    expect(brief).toContain('| median (1–5) | **2.7** |');
    expect(brief).toContain('| safety % (hard checks) | **75%** |');
    expect(brief).toContain('| invented count (truthful=0) | **1** |');
    expect(brief).toContain('| one-rec % (next_action=2) | **25%**');
    expect(brief).toContain('| `greeting` |');
    expect(brief).toContain('| `lapsed-flopped` |');
    expect(brief).toContain('## Suggested delta themes');
    expect(brief).toContain('`upcoming-first`');
  });

  it('rejects the wrong schema', () => {
    expect(() =>
      parseHelpfulnessResults({ schema: 'other', version: 'x', cases: [] })
    ).toThrow(/jovie\.helpfulness-eval\/v1/);
  });
});
