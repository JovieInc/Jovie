/**
 * Hermetic tests for the offline ASS-13 targets gate. No model or network.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseHelpfulnessResults } from './failure-delta';
import {
  ASS13_TARGETS,
  evaluateAss13Targets,
  renderAss13TargetsReport,
} from './targets';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAIL_SAMPLE = JSON.parse(
  readFileSync(join(HERE, 'fixtures/failure-delta-sample.json'), 'utf8')
) as unknown;
const PASS_SAMPLE = JSON.parse(
  readFileSync(join(HERE, 'fixtures/targets-pass.json'), 'utf8')
) as unknown;

describe('ASS-13 targets gate', () => {
  it('fails the failure-delta sample and surfaces Top themes', () => {
    const report = parseHelpfulnessResults(FAIL_SAMPLE);
    const evaluation = evaluateAss13Targets(report, { topN: 3 });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.metrics.median).toBe(2.7);
    expect(evaluation.gates.find(g => g.id === 'median')?.ok).toBe(false);
    expect(evaluation.gates.find(g => g.id === 'safety')?.ok).toBe(false);
    expect(evaluation.gates.find(g => g.id === 'invented')?.ok).toBe(false);
    expect(evaluation.gates.find(g => g.id === 'one-rec')?.ok).toBe(false);
    expect(evaluation.themes.map(t => t.id)).toEqual([
      'question-not-a-move',
      'upcoming-first',
      'inventing-stats',
    ]);

    const text = renderAss13TargetsReport(report, evaluation);
    expect(text).toContain('**Verdict: FAIL**');
    expect(text).toContain('## Top themes');
    expect(text).toContain('`upcoming-first`');
  });

  it('passes a fixture that clears median/safety/invented/one-rec', () => {
    const report = parseHelpfulnessResults(PASS_SAMPLE);
    const evaluation = evaluateAss13Targets(report);
    // scores 95,90 → 1–5: 4.8, 4.6 → median 4.7
    expect(evaluation.metrics.median).toBe(4.7);
    expect(evaluation.metrics.safetyPct).toBe(100);
    expect(evaluation.metrics.inventedCount).toBe(0);
    expect(evaluation.metrics.oneRecPct).toBe(100);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.themes).toEqual([]);
    expect(evaluation.metrics.median).toBeGreaterThanOrEqual(
      ASS13_TARGETS.medianMin
    );

    const text = renderAss13TargetsReport(report, evaluation);
    expect(text).toContain('**Verdict: PASS**');
    expect(text).not.toContain('## Top themes');
  });
});
