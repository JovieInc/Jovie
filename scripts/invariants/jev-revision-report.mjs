/** JOV-8414: offline replay of frozen pilot archives. No model calls or calibration. */
import { readFileSync } from 'node:fs';
import { WRITING_QUALITY_RUBRICS } from '../../packages/copy/writing-quality.ts';
import {
  REVISION_SCENARIOS,
  revisionEvidenceDigest,
  revisionTextDigest,
  validateRevisionEvidence,
} from './jev-revision-evidence.mjs';

export {
  MAX_REVISION_EXAMPLES,
  REVISION_REPLAY_SCHEMA,
  REVISION_SCENARIOS,
  revisionEvidenceDigest,
  revisionTextDigest,
} from './jev-revision-evidence.mjs';
export const REVISION_REPORT_SCHEMA = 'jovie.revision-quality-report/v1';
const finite = v => Number.isFinite(v) && v >= 0;
const IMPLEMENTATION_SHA256 = revisionEvidenceDigest(
  [
    './jev-revision-report.mjs',
    './jev-revision-evidence.mjs',
    './jev-revision-report-cli.mjs',
    '../lib/canonical-json.mjs',
    './writing-surfaces.mjs',
    './writing-surfaces-registry.json',
  ].map(path =>
    revisionTextDigest(readFileSync(new URL(path, import.meta.url)))
  )
);
const rate = (numerator, denominator) => ({
  numerator,
  denominator,
  rate: denominator ? numerator / denominator : null,
});
const average = values => ({
  n: values.length,
  mean: values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null,
});
function latency(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? null,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
  };
}

function summarize(rows) {
  const metrics = {};
  for (const phase of ['baseline', 'revised']) {
    const labeled = rows.filter(
      r => r.label?.[phase] && r.run[phase].state !== 'fallback'
    );
    const falseClaims = labeled.filter(r => r.label[phase].factual === false);
    const costs = rows.map(({ run }) => {
      const calls =
        phase === 'baseline'
          ? run.baseline.calls
          : [...run.baseline.calls, ...run.revised.calls];
      return calls.every(c => finite(c?.costUsd))
        ? calls.reduce((s, c) => s + c.costUsd, 0)
        : null;
    });
    const knownCosts = costs.filter(c => c !== null);
    metrics[phase] = {
      usefulness: average(labeled.map(r => r.label[phase].usefulness)),
      voice: average(labeled.map(r => r.label[phase].voice)),
      factualFalseAcceptance: rate(
        falseClaims.filter(r => r.run[phase].state === 'accepted').length,
        falseClaims.length
      ),
      abstention: rate(
        rows.filter(r => r.run[phase].state === 'abstain').length,
        rows.length
      ),
      fallback: rate(
        rows.filter(r => r.run[phase].state === 'fallback').length,
        rows.length
      ),
      latencyMs: latency(
        rows.map(
          r =>
            r.run.baseline.latencyMs +
            (phase === 'revised' ? r.run.revised.latencyMs : 0)
        )
      ),
      attributableCostUsd: {
        n: knownCosts.length,
        total:
          knownCosts.length === rows.length && rows.length
            ? knownCosts.reduce((a, b) => a + b, 0)
            : null,
        ...average(knownCosts),
      },
      tokens: {
        input: rows
          .flatMap(r =>
            phase === 'baseline'
              ? r.run.baseline.calls
              : [...r.run.baseline.calls, ...r.run.revised.calls]
          )
          .reduce((s, c) => s + (c?.inputTokens ?? 0), 0),
        output: rows
          .flatMap(r =>
            phase === 'baseline'
              ? r.run.baseline.calls
              : [...r.run.baseline.calls, ...r.run.revised.calls]
          )
          .reduce((s, c) => s + (c?.outputTokens ?? 0), 0),
      },
    };
  }
  const pairs = rows.filter(
    r =>
      r.label?.baseline &&
      r.label?.revised &&
      r.run.revised.state !== 'fallback'
  );
  const revisions = rows.filter(
    r =>
      r.run.revisionCount === 1 &&
      r.label?.revised &&
      r.run.revised.state !== 'fallback'
  );
  return {
    ...metrics,
    pairedDelta: {
      usefulness: average(
        pairs.map(r => r.label.revised.usefulness - r.label.baseline.usefulness)
      ),
      voice: average(
        pairs.map(r => r.label.revised.voice - r.label.baseline.voice)
      ),
    },
    introducedDrift: rate(
      revisions.filter(r => r.label.revised.introducedDrift).length,
      revisions.length
    ),
    preservationFailures: rate(
      revisions.filter(r => r.label.revised.preservationFailure).length,
      revisions.length
    ),
    revisionCounts: {
      n: rows.length,
      zero: rows.filter(r => r.run.revisionCount === 0).length,
      one: rows.filter(r => r.run.revisionCount === 1).length,
    },
    failures: {
      timeout: rows.filter(r => r.run.failure === 'timeout').length,
      budget: rows.filter(r => r.run.failure === 'budget').length,
      denominator: rows.length,
    },
  };
}

/** Trusted local owner projection only. Hashes bind content; they do not authenticate owners. */
export function buildRevisionQualityReport(input = {}) {
  const reasons = [];
  const { corpus, rows } = validateRevisionEvidence(input, reasons);
  const metrics = summarize(rows);
  const limits = input?.limits;
  const pairCount = metrics.pairedDelta.usefulness.n;
  if (
    corpus &&
    (!pairCount ||
      pairCount < limits?.minPairs ||
      !metrics.introducedDrift.denominator ||
      !metrics.revised.factualFalseAcceptance.denominator)
  )
    reasons.push('insufficient-labeled-pairs-or-protected-strata');
  const comparisonPassed =
    pairCount > 0 &&
    metrics.pairedDelta.usefulness.mean >= limits?.minUsefulnessDelta &&
    metrics.pairedDelta.voice.mean >= limits?.minVoiceDelta;
  const criticalFixturesPassed =
    rows.length > 0 &&
    rows.every(
      ({ run, example, label }) =>
        label &&
        run.revised.state === example.expectedState &&
        (!example.scenarios.includes('timeout') || run.failure === 'timeout') &&
        (!example.scenarios.includes('budget-failure') ||
          run.failure === 'budget') &&
        !(
          run.revised.state !== 'abstain' && label.revised?.factual === false
        ) &&
        !label.revised?.introducedDrift &&
        !label.revised?.preservationFailure
    );
  const protectedMetricsPassed =
    metrics.revised.factualFalseAcceptance.rate !== null &&
    metrics.revised.factualFalseAcceptance.rate <=
      limits?.maxFactualFalseAcceptance &&
    metrics.introducedDrift.rate !== null &&
    metrics.introducedDrift.rate <= limits?.maxIntroducedDrift &&
    metrics.preservationFailures.rate <= limits?.maxPreservationFailures &&
    metrics.revised.abstention.rate <= limits?.maxAbstentionRate &&
    metrics.revised.fallback.rate <= limits?.maxFallbackRate &&
    metrics.revised.latencyMs.p95 <= limits?.maxP95LatencyMs &&
    metrics.revised.attributableCostUsd.n === rows.length &&
    metrics.revised.attributableCostUsd.mean <= limits?.maxCostPerExampleUsd;
  const status = reasons.length
    ? 'inconclusive'
    : comparisonPassed && criticalFixturesPassed && protectedMetricsPassed
      ? 'eligible-for-bounded-canary'
      : 'retain';
  return {
    schema: REVISION_REPORT_SCHEMA,
    issue: 'JOV-8414',
    status,
    qualityGain:
      status === 'inconclusive'
        ? null
        : status === 'eligible-for-bounded-canary',
    reasons: [...new Set(reasons)],
    comparisonPassed,
    criticalFixturesPassed,
    protectedMetricsPassed,
    hashes: {
      input: revisionEvidenceDigest(input),
      corpus: revisionEvidenceDigest(input?.corpus ?? null),
      labels: revisionEvidenceDigest(input?.labels ?? null),
      models: revisionEvidenceDigest({
        writer: input?.target?.writerModel ?? null,
        judge: input?.target?.resolvedModel ?? null,
        writerProvider: input?.target?.writerProvider ?? null,
        judgeProvider: input?.target?.judgeProvider ?? null,
      }),
      rubric: revisionEvidenceDigest(WRITING_QUALITY_RUBRICS),
      implementation: IMPLEMENTATION_SHA256,
      calibration: revisionEvidenceDigest(input?.calibration ?? null),
      limits: revisionEvidenceDigest(limits ?? null),
      promptContext: revisionEvidenceDigest(input?.promptContext ?? null),
      runs: revisionEvidenceDigest(input?.runs ?? null),
    },
    corpusVersion: input?.corpus?.version ?? null,
    surfaceId: input?.target?.surfaceId ?? null,
    sourceSha: input?.target?.sourceSha ?? null,
    heldoutCount: corpus?.holdout.length ?? 0,
    matchedRuns: rows.length,
    scenarios: Object.fromEntries(
      REVISION_SCENARIOS.map(s => [
        s,
        corpus?.holdout.filter(e => e.scenarios.includes(s)).length ?? 0,
      ])
    ),
    metrics,
    authority:
      'observation-only; existing JOV-6414 admission and JOV-3723 delivery checks still required',
    decision: {
      shipNow: 'offline observation report',
      reevaluateWhen:
        'approved labels, calibration and funded executed pilot archives are complete',
      then: 'evaluate frozen surface limits through existing promotion authority',
    },
  };
}
