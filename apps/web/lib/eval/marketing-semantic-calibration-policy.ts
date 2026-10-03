import {
  MARKETING_SEMANTIC_JEV_ROUTE,
  type MarketingSemanticReviewInput,
  type MarketingSemanticReviewResult,
  marketingSemanticEvidenceFingerprint,
  prepareMarketingSemanticRequest,
} from '@/data/marketing/semanticReview';
import {
  HUMAN_HOLDOUT_SCHEMA_VERSION,
  type HumanHoldoutSet,
  type JudgeBinaryLabel,
  runJudgeCalibrationGate,
} from './calibration';
import type {
  CalibrationOutcome,
  MarketingCalibrationAgreement,
  MarketingCalibrationCaseOrigin,
  MarketingCalibrationCorpusValidation,
  MarketingCalibrationLabelSource,
  MarketingCalibrationMetricDelta,
  MarketingCalibrationMetrics,
  MarketingCalibrationObservationSource,
  MarketingCalibrationPreferenceSummary,
  MarketingCalibrationSplit,
  MarketingSemanticCalibrationCase,
  MarketingSemanticCalibrationEvaluatorObservation,
} from './marketing-semantic-calibration-types';
import {
  MIN_REAL_HUMAN_HELDOUT_CASES,
  MIN_REAL_HUMAN_HELDOUT_COVERAGE,
} from './marketing-semantic-calibration-types';

const SPLITS: readonly MarketingCalibrationSplit[] = [
  'development',
  'held-out',
];
const LABEL_SOURCES: readonly MarketingCalibrationLabelSource[] = [
  'synthetic-hand-authored',
  'human-review',
];
const CASE_ORIGINS: readonly MarketingCalibrationCaseOrigin[] = [
  'synthetic-fixture',
  'public-artifact',
  'source-backed-constructed',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLabel(value: unknown): value is JudgeBinaryLabel {
  return value === 'pass' || value === 'fail';
}

export function isOutcome(value: unknown): value is CalibrationOutcome {
  return value === 'pass' || value === 'fail' || value === 'abstain';
}

function isSplit(value: unknown): value is MarketingCalibrationSplit {
  return SPLITS.includes(value as MarketingCalibrationSplit);
}

function isLabelSource(
  value: unknown
): value is MarketingCalibrationLabelSource {
  return LABEL_SOURCES.includes(value as MarketingCalibrationLabelSource);
}

function isCaseOrigin(value: unknown): value is MarketingCalibrationCaseOrigin {
  return CASE_ORIGINS.includes(value as MarketingCalibrationCaseOrigin);
}

function preferenceErrors(
  row: MarketingSemanticCalibrationCase
): readonly string[] {
  const preference = row.preference;
  if (!preference) return [];

  const errors: string[] = [];
  const candidateIds = preference.candidateIds;
  const hasCandidateIds =
    Array.isArray(candidateIds) &&
    candidateIds.length >= 2 &&
    candidateIds.every(id => typeof id === 'string' && id.trim() !== '');
  if (!hasCandidateIds) {
    errors.push(`${row.id}: preference requires two non-empty candidate ids`);
  } else if (new Set(candidateIds).size !== candidateIds.length) {
    errors.push(`${row.id}: preference candidate ids must be unique`);
  }
  if (
    typeof preference.preferredCandidateId !== 'string' ||
    !hasCandidateIds ||
    !candidateIds.includes(preference.preferredCandidateId)
  ) {
    errors.push(`${row.id}: preference winner must be one of the candidates`);
  }
  if (preference.blinded !== true || preference.reversed !== true) {
    errors.push(
      `${row.id}: preference must record blinded and reversed checks`
    );
  }
  if (preference.labelSource !== row.labelSource) {
    errors.push(`${row.id}: preference label provenance does not match case`);
  }
  return errors;
}

export function validateMarketingCalibrationCorpus(
  cases: readonly MarketingSemanticCalibrationCase[]
): MarketingCalibrationCorpusValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  const caseIds = new Set<string>();
  const families = new Map<string, MarketingCalibrationSplit>();

  if (!Array.isArray(cases) || cases.length === 0) {
    return { valid: false, errors: ['calibration corpus must not be empty'] };
  }

  for (const row of cases) {
    if (!isRecord(row)) {
      errors.push('calibration case must be an object');
      continue;
    }
    if (typeof row.id !== 'string' || row.id.trim() === '') {
      errors.push('calibration case requires a non-empty id');
    } else if (ids.has(row.id)) {
      errors.push(`duplicate calibration id: ${row.id}`);
    } else {
      ids.add(row.id);
    }
    if (typeof row.caseId !== 'string' || row.caseId.trim() === '') {
      errors.push(`${row.id ?? 'case'} requires a non-empty caseId`);
    } else if (caseIds.has(row.caseId)) {
      errors.push(`duplicate calibration caseId: ${row.caseId}`);
    } else {
      caseIds.add(row.caseId);
    }
    if (!isSplit(row.split)) errors.push(`${row.id}: invalid split`);
    if (typeof row.pageFamily !== 'string' || row.pageFamily.trim() === '') {
      errors.push(`${row.id}: pageFamily is required`);
    } else if (isSplit(row.split)) {
      const previous = families.get(row.pageFamily);
      if (previous && previous !== row.split) {
        errors.push(
          `${row.id}: page family ${row.pageFamily} leaks across development and held-out splits`
        );
      } else {
        families.set(row.pageFamily, row.split);
      }
    }
    if (typeof row.synthetic !== 'boolean') {
      errors.push(`${row.id}: synthetic provenance is required`);
    }
    if (!isCaseOrigin(row.caseOrigin)) {
      errors.push(`${row.id}: invalid caseOrigin`);
    }
    if (!isLabelSource(row.labelSource)) {
      errors.push(`${row.id}: invalid labelSource`);
    } else if (
      (row.labelSource === 'synthetic-hand-authored' &&
        row.synthetic !== true) ||
      (row.labelSource === 'human-review' &&
        row.caseOrigin === 'synthetic-fixture')
    ) {
      errors.push(`${row.id}: input origin and labelSource disagree`);
    }
    if (!isLabel(row.referenceLabel)) {
      errors.push(`${row.id}: referenceLabel must be pass or fail`);
    }
    if (!isOutcome(row.baselineOutcome)) {
      errors.push(`${row.id}: baselineOutcome is invalid`);
    }
    errors.push(...preferenceErrors(row));
  }

  return { valid: errors.length === 0, errors };
}

export function assertMarketingCalibrationCorpus(
  cases: readonly MarketingSemanticCalibrationCase[]
): void {
  const validation = validateMarketingCalibrationCorpus(cases);
  if (!validation.valid) {
    throw new Error(
      `Invalid marketing calibration corpus:\n${validation.errors.join('\n')}`
    );
  }
}

export function uniqueStrings(
  values: readonly (string | null)[]
): readonly string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort();
}

function semanticOutcome(result: unknown): CalibrationOutcome {
  if (!isRecord(result) || result.status !== 'evaluated') return 'abstain';
  return result.verdict === 'supported' ? 'pass' : 'fail';
}

export function safeObservation(
  result: MarketingSemanticReviewResult | unknown,
  input: MarketingSemanticReviewInput,
  requestedSource: MarketingCalibrationObservationSource = 'unknown'
): MarketingSemanticCalibrationEvaluatorObservation {
  const value = isRecord(result) ? result : {};
  const status = value.status === 'evaluated' ? 'evaluated' : 'abstained';
  const observation = {
    status,
    outcome: semanticOutcome(result),
    verdict: typeof value.verdict === 'string' ? value.verdict : null,
    reasonCode: typeof value.reasonCode === 'string' ? value.reasonCode : null,
    sourceSha: typeof value.sourceSha === 'string' ? value.sourceSha : null,
    artifactSha256:
      typeof value.artifactSha256 === 'string' ? value.artifactSha256 : null,
    evidenceFingerprint:
      typeof value.evidenceFingerprint === 'string'
        ? value.evidenceFingerprint
        : null,
    requestFingerprint:
      typeof value.requestFingerprint === 'string'
        ? value.requestFingerprint
        : null,
    observationSource: 'unknown' as MarketingCalibrationObservationSource,
    model: typeof value.model === 'string' ? value.model : null,
    resolvedModel:
      typeof value.resolvedModel === 'string' ? value.resolvedModel : null,
    modelIdentityBasis:
      typeof value.modelIdentityBasis === 'string'
        ? value.modelIdentityBasis
        : null,
  };
  if (status !== 'evaluated') {
    return {
      ...observation,
      observationSource: requestedSource === 'mocked' ? 'mocked' : 'unknown',
    };
  }

  let prepared: ReturnType<typeof prepareMarketingSemanticRequest> = null;
  let evidenceFingerprint: string | null = null;
  try {
    prepared = prepareMarketingSemanticRequest(input);
    evidenceFingerprint = marketingSemanticEvidenceFingerprint(input);
  } catch {
    prepared = null;
  }
  const bindingMatches =
    prepared !== null &&
    evidenceFingerprint !== null &&
    observation.requestFingerprint === prepared.fingerprint &&
    observation.sourceSha === prepared.sourceSha &&
    observation.artifactSha256 === prepared.artifactSha256 &&
    observation.evidenceFingerprint === evidenceFingerprint;
  const modelMatches = observation.model === MARKETING_SEMANTIC_JEV_ROUTE.model;
  const hasAdapterReceipt =
    value.modelIdentityBasis === 'explicit-gateway-model-instance';
  const observationSource =
    requestedSource === 'mocked'
      ? 'mocked'
      : hasAdapterReceipt
        ? 'live-bound'
        : 'unknown';
  if (bindingMatches && modelMatches) {
    return { ...observation, observationSource };
  }

  return {
    ...observation,
    observationSource,
    status: 'abstained',
    outcome: 'abstain',
    verdict: null,
    reasonCode: modelMatches ? 'stale-evidence' : 'invalid-response',
  };
}

function provenanceOf(
  rows: readonly MarketingSemanticCalibrationCase[]
): MarketingCalibrationMetrics['referenceProvenance'] {
  const sources = new Set(
    rows.map(row => (row.synthetic ? 'synthetic' : 'human-heldout'))
  );
  if (sources.size === 0) return 'unknown';
  if (sources.size > 1) return 'mixed';
  return sources.values().next().value as 'synthetic' | 'human-heldout';
}

function metricsFor(
  split: MarketingCalibrationMetrics['split'],
  rows: readonly MarketingSemanticCalibrationCase[],
  outcomes: ReadonlyMap<string, CalibrationOutcome>
): MarketingCalibrationMetrics {
  let evaluatedCount = 0;
  let passCount = 0;
  let blockCount = 0;
  let abstentionCount = 0;
  let falsePassCount = 0;
  let falseBlockCount = 0;

  for (const row of rows) {
    const outcome = outcomes.get(row.id);
    if (!outcome) continue;
    if (outcome === 'abstain') abstentionCount += 1;
    else {
      evaluatedCount += 1;
      if (outcome === 'pass') passCount += 1;
      else blockCount += 1;
    }
    if (row.referenceLabel === 'fail' && outcome === 'pass')
      falsePassCount += 1;
    if (
      row.referenceLabel === 'pass' &&
      (outcome === 'fail' || outcome === 'abstain')
    ) {
      falseBlockCount += 1;
    }
  }

  const referenceLabelCount = rows.length;
  return {
    split,
    totalCases: rows.length,
    evaluatedCount,
    passCount,
    blockCount,
    abstentionCount,
    falsePassCount,
    falseBlockCount,
    falsePassRate:
      referenceLabelCount > 0 ? falsePassCount / referenceLabelCount : null,
    falseBlockRate:
      referenceLabelCount > 0 ? falseBlockCount / referenceLabelCount : null,
    referenceLabelCount,
    referenceProvenance: provenanceOf(rows),
  };
}

export function metricSets(
  cases: readonly MarketingSemanticCalibrationCase[],
  outcomes: ReadonlyMap<string, CalibrationOutcome>
): readonly MarketingCalibrationMetrics[] {
  return [
    metricsFor('all', cases, outcomes),
    metricsFor(
      'development',
      cases.filter(row => row.split === 'development'),
      outcomes
    ),
    metricsFor(
      'held-out',
      cases.filter(row => row.split === 'held-out'),
      outcomes
    ),
  ];
}

export function compareMetrics(
  baseline: readonly MarketingCalibrationMetrics[],
  semantic: readonly MarketingCalibrationMetrics[]
): readonly MarketingCalibrationMetricDelta[] {
  return semantic.map((current, index) => {
    const previous = baseline[index];
    return {
      falsePassCount: current.falsePassCount - previous.falsePassCount,
      falseBlockCount: current.falseBlockCount - previous.falseBlockCount,
      abstentionCount: current.abstentionCount - previous.abstentionCount,
      falsePassRate:
        current.falsePassRate === null || previous.falsePassRate === null
          ? null
          : current.falsePassRate - previous.falsePassRate,
      falseBlockRate:
        current.falseBlockRate === null || previous.falseBlockRate === null
          ? null
          : current.falseBlockRate - previous.falseBlockRate,
    };
  });
}

export function agreementFor(
  cases: readonly MarketingSemanticCalibrationCase[],
  outcomes: ReadonlyMap<string, CalibrationOutcome>,
  observationSources: ReadonlyMap<
    string,
    MarketingCalibrationObservationSource
  >,
  generatedAt: string,
  threshold: number
): MarketingCalibrationAgreement {
  const realHuman = cases.filter(
    row =>
      row.split === 'held-out' &&
      row.synthetic === false &&
      row.labelSource === 'human-review'
  );
  const eligible = realHuman.filter(row => {
    const outcome = outcomes.get(row.id);
    return outcome === 'pass' || outcome === 'fail';
  });
  const excludedAbstentions = realHuman.length - eligible.length;
  const syntheticEvidenceOnly = realHuman.length === 0;
  const nonAbstainingCoverage =
    realHuman.length === 0 ? null : eligible.length / realHuman.length;

  if (realHuman.length === 0) {
    return {
      status: 'unqualified',
      reason: 'real-human-heldout-required',
      syntheticEvidenceOnly: true,
      eligibleCaseCount: 0,
      nonAbstainingCoverage,
      excludedAbstentions,
      gate: null,
    };
  }
  if (eligible.length < MIN_REAL_HUMAN_HELDOUT_CASES) {
    return {
      status: 'unqualified',
      reason: 'human-heldout-sample-too-small-or-abstained',
      syntheticEvidenceOnly,
      eligibleCaseCount: eligible.length,
      nonAbstainingCoverage,
      excludedAbstentions,
      gate: null,
    };
  }
  if (nonAbstainingCoverage < MIN_REAL_HUMAN_HELDOUT_COVERAGE) {
    return {
      status: 'unqualified',
      reason: 'human-heldout-non-abstaining-coverage-too-low',
      syntheticEvidenceOnly,
      eligibleCaseCount: eligible.length,
      nonAbstainingCoverage,
      excludedAbstentions,
      gate: null,
    };
  }
  if (eligible.some(row => observationSources.get(row.id) !== 'live-bound')) {
    return {
      status: 'unqualified',
      reason: 'live-bound-observation-required',
      syntheticEvidenceOnly,
      eligibleCaseCount: eligible.length,
      nonAbstainingCoverage,
      excludedAbstentions,
      gate: null,
    };
  }
  if (new Set(eligible.map(row => row.referenceLabel)).size < 2) {
    return {
      status: 'unqualified',
      reason: 'human-heldout-needs-both-pass-and-fail-labels',
      syntheticEvidenceOnly,
      eligibleCaseCount: eligible.length,
      nonAbstainingCoverage,
      excludedAbstentions,
      gate: null,
    };
  }

  const holdout: HumanHoldoutSet = {
    schemaVersion: HUMAN_HOLDOUT_SCHEMA_VERSION,
    labeledAt: generatedAt,
    items: eligible.map(row => ({
      id: row.id,
      caseId: row.caseId,
      humanLabel: row.referenceLabel,
    })),
  };
  const labels = Object.fromEntries(
    eligible.map(row => [row.id, outcomes.get(row.id) as JudgeBinaryLabel])
  );
  const gate = runJudgeCalibrationGate({
    holdout,
    judgeLabels: labels,
    threshold,
  });
  return {
    status: gate.passed ? 'passed' : 'failed',
    reason: gate.passed
      ? 'human-heldout-kappa-passed'
      : 'human-heldout-kappa-failed',
    syntheticEvidenceOnly,
    eligibleCaseCount: eligible.length,
    nonAbstainingCoverage,
    excludedAbstentions,
    gate,
  };
}

export function preferenceSummary(
  cases: readonly MarketingSemanticCalibrationCase[]
): MarketingCalibrationPreferenceSummary {
  const rows = cases.filter(row => row.preference);
  return {
    status: rows.length > 0 ? 'passed' : 'not-applicable',
    total: rows.length,
    valid: rows.length,
    invalid: 0,
    blindedCount: rows.filter(row => row.preference?.blinded === true).length,
    reversedCount: rows.filter(row => row.preference?.reversed === true).length,
  };
}
