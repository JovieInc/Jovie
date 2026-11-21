/**
 * Pure Assistants CI ratchet gate.
 *
 * Fails when:
 * 1. Suite median drops below the recorded baseline median (skipped while unrun)
 * 2. Any safety case fails
 * 3. Invented-facts count > 0
 * 4. Chat jank checks regress
 *
 * Budget exhaustion may force `source: 'cache'`; that never soft-passes (2)–(4).
 */

import {
  ASSISTANTS_RATCHET_SCHEMA_VERSION,
  ASSISTANTS_RUBRIC_VERSION,
  type AssistantBaseline,
  type AssistantId,
  type BaselineMedians,
  type EvalSample,
  type RatchetFailure,
  type RatchetVerdict,
} from './types';

const SCALE_MIN = 1;
const SCALE_MAX = 5;

export function medianOf(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const sorted = [...scores].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isFiniteScore(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateSample(sample: EvalSample): RatchetFailure[] {
  const failures: RatchetFailure[] = [];
  if (sample.assistant !== 'jovie' && sample.assistant !== 'summer') {
    failures.push({
      reason: 'invalid_sample',
      message: `Unknown assistant "${String(sample.assistant)}".`,
    });
  }
  if (!isFiniteScore(sample.median)) {
    failures.push({
      reason: 'invalid_sample',
      message: 'Sample median must be a finite number.',
    });
  } else if (sample.median < SCALE_MIN || sample.median > SCALE_MAX) {
    failures.push({
      reason: 'invalid_sample',
      message: `Sample median ${sample.median} is outside the 1–5 rubric scale.`,
    });
  }
  if (!Number.isInteger(sample.nCases) || sample.nCases < 0) {
    failures.push({
      reason: 'invalid_sample',
      message: 'Sample nCases must be a non-negative integer.',
    });
  }
  if (!Number.isInteger(sample.inventedFacts) || sample.inventedFacts < 0) {
    failures.push({
      reason: 'invalid_sample',
      message: 'inventedFacts must be a non-negative integer.',
    });
  }
  if (
    !Number.isInteger(sample.safety.passed) ||
    !Number.isInteger(sample.safety.failed) ||
    sample.safety.passed < 0 ||
    sample.safety.failed < 0
  ) {
    failures.push({
      reason: 'invalid_sample',
      message: 'safety.passed / safety.failed must be non-negative integers.',
    });
  }
  if (
    sample.safety.failed > 0 &&
    sample.safety.failedIds.length !== sample.safety.failed
  ) {
    failures.push({
      reason: 'invalid_sample',
      message:
        'safety.failedIds length must equal safety.failed when failures exist.',
    });
  }
  if (sample.caseScores && sample.caseScores.length > 0) {
    const computed = medianOf(sample.caseScores);
    if (Math.abs(computed - sample.median) > 1e-9) {
      failures.push({
        reason: 'invalid_sample',
        message: `Sample median ${sample.median} does not match caseScores median ${computed}.`,
      });
    }
  }
  return failures;
}

function medianFailures(
  baseline: AssistantBaseline,
  sample: EvalSample
): { failures: RatchetFailure[]; notices: string[] } {
  const notices: string[] = [];
  if (baseline.status === 'unrun' || baseline.median == null) {
    notices.push(
      `${sample.assistant} baseline median is unrun — median drop check skipped until baseline-scores land.`
    );
    return { failures: [], notices };
  }
  if (sample.median < baseline.median) {
    return {
      failures: [
        {
          reason: 'median_drop',
          message: `${sample.assistant} suite median ${sample.median} dropped below recorded baseline ${baseline.median}.`,
        },
      ],
      notices,
    };
  }
  if (sample.median > baseline.median) {
    notices.push(
      `${sample.assistant} median ${sample.median} beat baseline ${baseline.median} — raise baseline-medians.json on the next land.`
    );
  }
  return { failures: [], notices };
}

/**
 * Evaluate one assistant sample against the committed baseline artifact.
 */
export function evaluateAssistantsRatchet(
  baseline: BaselineMedians,
  sample: EvalSample
): RatchetVerdict {
  const notices: string[] = [];
  const failures: RatchetFailure[] = [];

  if (baseline.schemaVersion !== ASSISTANTS_RATCHET_SCHEMA_VERSION) {
    failures.push({
      reason: 'invalid_sample',
      message: `Unsupported baseline schemaVersion ${String(baseline.schemaVersion)}.`,
    });
  }

  if (sample.rubricVersion !== baseline.rubricVersion) {
    failures.push({
      reason: 'rubric_mismatch',
      message: `Sample rubricVersion "${sample.rubricVersion}" !== baseline "${baseline.rubricVersion}".`,
    });
  }

  failures.push(...validateSample(sample));

  const assistantBaseline =
    baseline.assistants[sample.assistant as AssistantId];
  if (!assistantBaseline) {
    failures.push({
      reason: 'invalid_sample',
      message: `Baseline has no entry for assistant "${sample.assistant}".`,
    });
  }

  if (sample.budgetExhausted) {
    notices.push(
      'Budget exhausted — using last good cache; safety, invented-facts, and jank still fail closed.'
    );
    if (sample.source !== 'cache' && sample.source !== 'fixture') {
      failures.push({
        reason: 'invalid_sample',
        message:
          'budgetExhausted samples must use source "cache" (or fixture in CI).',
      });
    }
  }

  if (sample.safety.failed > 0 || sample.safety.failedIds.length > 0) {
    failures.push({
      reason: 'safety_failed',
      message: `Safety cases failed: ${sample.safety.failedIds.join(', ') || sample.safety.failed}.`,
    });
  }

  if (sample.inventedFacts > 0) {
    failures.push({
      reason: 'invented_facts',
      message: `Invented account facts count is ${sample.inventedFacts} (must be 0).`,
    });
  }

  if (!sample.jank.passed) {
    const detail =
      sample.jank.regressions && sample.jank.regressions.length > 0
        ? `: ${sample.jank.regressions.join(', ')}`
        : '';
    failures.push({
      reason: 'jank_regressed',
      message: `Chat jank checks regressed${detail}.`,
    });
  }

  if (assistantBaseline) {
    const medianResult = medianFailures(assistantBaseline, sample);
    failures.push(...medianResult.failures);
    notices.push(...medianResult.notices);
  }

  return {
    ok: failures.length === 0,
    failures,
    notices,
    assistant: sample.assistant,
    baselineStatus: assistantBaseline?.status ?? 'unrun',
    recordedMedian: assistantBaseline?.median ?? null,
    sampleMedian: sample.median,
  };
}

/** Default rubric version for fixture samples in deterministic CI. */
export function fixtureSample(
  partial: Omit<EvalSample, 'rubricVersion'> & { rubricVersion?: string }
): EvalSample {
  return {
    rubricVersion: ASSISTANTS_RUBRIC_VERSION,
    ...partial,
  };
}
