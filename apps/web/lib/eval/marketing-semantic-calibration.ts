import { readFile, writeFile } from 'node:fs/promises';

import { DEFAULT_KAPPA_THRESHOLD } from './calibration';
import {
  agreementFor,
  assertMarketingCalibrationCorpus,
  compareMetrics,
  isOutcome,
  metricSets,
  preferenceSummary,
  safeObservation,
  uniqueStrings,
} from './marketing-semantic-calibration-policy';
import {
  type CalibrationOutcome,
  MARKETING_SEMANTIC_CALIBRATION_SCHEMA_VERSION,
  type MarketingCalibrationModelIdentity,
  type MarketingCalibrationObservationSource,
  type MarketingSemanticCalibrationCase,
  type MarketingSemanticCalibrationCaseResult,
  type MarketingSemanticCalibrationEvaluatorObservation,
  type MarketingSemanticCalibrationReport,
  type MarketingSemanticCalibrationRunInput,
} from './marketing-semantic-calibration-types';

export {
  assertMarketingCalibrationCorpus,
  validateMarketingCalibrationCorpus,
} from './marketing-semantic-calibration-policy';
export * from './marketing-semantic-calibration-types';

export async function runMarketingSemanticCalibration(
  input: MarketingSemanticCalibrationRunInput
): Promise<MarketingSemanticCalibrationReport> {
  assertMarketingCalibrationCorpus(input.cases);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const threshold = input.threshold ?? DEFAULT_KAPPA_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(
      'Calibration threshold must be a finite number between 0 and 1'
    );
  }
  const baselineEvaluator =
    input.evaluateBaseline ??
    ((row: MarketingSemanticCalibrationCase) => row.baselineOutcome);
  const baselineOutcomes = new Map<string, CalibrationOutcome>();
  const semanticOutcomes = new Map<string, CalibrationOutcome>();
  const semanticObservationSources = new Map<
    string,
    MarketingCalibrationObservationSource
  >();
  const caseResults: MarketingSemanticCalibrationCaseResult[] = [];
  const semanticObservations: MarketingSemanticCalibrationEvaluatorObservation[] =
    [];

  for (const row of input.cases) {
    const baseline = await baselineEvaluator(row);
    if (!isOutcome(baseline)) {
      throw new Error(
        `Baseline evaluator returned an invalid outcome for ${row.id}`
      );
    }
    const result = await input.evaluateSemantic(row);
    const semantic = safeObservation(
      result,
      row.input,
      input.observationSource ?? 'unknown'
    );
    baselineOutcomes.set(row.id, baseline);
    semanticOutcomes.set(row.id, semantic.outcome);
    semanticObservationSources.set(row.id, semantic.observationSource);
    semanticObservations.push(semantic);
    caseResults.push({
      id: row.id,
      caseId: row.caseId,
      pageFamily: row.pageFamily,
      split: row.split,
      caseOrigin: row.caseOrigin,
      referenceLabel: row.referenceLabel,
      labelSource: row.labelSource,
      synthetic: row.synthetic,
      baselineOutcome: baseline,
      semantic,
    });
  }

  const baseline = metricSets(input.cases, baselineOutcomes);
  const semantic = metricSets(input.cases, semanticOutcomes);
  const semanticCalibration = agreementFor(
    input.cases,
    semanticOutcomes,
    semanticObservationSources,
    generatedAt,
    threshold
  );
  const baselineCalibration = agreementFor(
    input.cases,
    baselineOutcomes,
    semanticObservationSources,
    generatedAt,
    threshold
  );
  const requested = input.enforcementRequested === true;
  const eligible = semanticCalibration.status === 'passed';
  const workflowUnknowns: string[] = [];
  if (input.workflow?.estimatedCostUsd === undefined) {
    workflowUnknowns.push('semantic-cost-not-measured');
  }
  if (input.workflow?.humanReviewMinutes === undefined) {
    workflowUnknowns.push('human-review-time-not-measured');
  }
  const modelIdentity: MarketingCalibrationModelIdentity = {
    configuredAliases: uniqueStrings(
      semanticObservations.map(item => item.model)
    ),
    resolvedModelIds: uniqueStrings(
      semanticObservations.map(item => item.resolvedModel)
    ),
    resolvedVersionStatus: semanticObservations.some(item => item.resolvedModel)
      ? 'observed'
      : 'unknown',
    aliasOrVersionUnknown: semanticObservations.some(
      item => !item.model || !item.resolvedModel
    ),
  };
  const syntheticLabelCount = input.cases.filter(
    row => row.labelSource === 'synthetic-hand-authored'
  ).length;
  const mockedObservationCount = semanticObservations.filter(
    item => item.observationSource === 'mocked'
  ).length;
  const liveBoundObservationCount = semanticObservations.filter(
    item => item.observationSource === 'live-bound'
  ).length;
  const unknownObservationCount = semanticObservations.filter(
    item => item.observationSource === 'unknown'
  ).length;

  return {
    schemaVersion: MARKETING_SEMANTIC_CALIBRATION_SCHEMA_VERSION,
    generatedAt,
    corpus: {
      caseCount: input.cases.length,
      developmentCount: input.cases.filter(row => row.split === 'development')
        .length,
      heldOutCount: input.cases.filter(row => row.split === 'held-out').length,
      realHumanHeldOutCount: input.cases.filter(
        row => row.split === 'held-out' && row.labelSource === 'human-review'
      ).length,
      syntheticCaseCount: input.cases.filter(row => row.synthetic).length,
      syntheticLabelCount,
      mockedObservationCount,
      liveBoundObservationCount,
      unknownObservationCount,
      pageFamilies: [...new Set(input.cases.map(row => row.pageFamily))].sort(),
      syntheticDataCannotPromote: true,
    },
    baseline,
    semantic,
    comparison: {
      baseline,
      semantic,
      semanticMinusBaseline: compareMetrics(baseline, semantic),
    },
    caseResults,
    baselineCalibration,
    semanticCalibration,
    preferences: preferenceSummary(input.cases),
    modelIdentity,
    workflow: {
      semanticCalls: input.cases.length,
      baselineCalls: input.cases.length,
      estimatedCostUsd: input.workflow?.estimatedCostUsd ?? null,
      humanReviewMinutes: input.workflow?.humanReviewMinutes ?? null,
      unknowns: workflowUnknowns,
    },
    enforcement: {
      requested,
      eligible,
      enabled: false,
      reason: eligible
        ? 'human-heldout-qualification-requires-external-gate-activation'
        : 'advisory-only-until-real-human-heldout-qualification',
    },
  };
}

export function serializeMarketingSemanticCalibrationReport(
  report: MarketingSemanticCalibrationReport
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function parseMarketingSemanticCalibrationReport(
  raw: unknown
): MarketingSemanticCalibrationReport {
  if (!isRecord(raw))
    throw new Error('Calibration report must be a JSON object');
  if (raw.schemaVersion !== MARKETING_SEMANTIC_CALIBRATION_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported marketing calibration schemaVersion: expected ${MARKETING_SEMANTIC_CALIBRATION_SCHEMA_VERSION}`
    );
  }
  if (typeof raw.generatedAt !== 'string' || raw.generatedAt.trim() === '') {
    throw new Error('Calibration report requires generatedAt');
  }
  if (!isRecord(raw.corpus) || raw.corpus.syntheticDataCannotPromote !== true) {
    throw new Error('Calibration report must retain synthetic promotion guard');
  }
  if (!Array.isArray(raw.caseResults) || !isRecord(raw.enforcement)) {
    throw new Error(
      'Calibration report is missing case results or enforcement'
    );
  }
  return raw as unknown as MarketingSemanticCalibrationReport;
}

export async function writeMarketingSemanticCalibrationReport(
  filePath: string,
  report: MarketingSemanticCalibrationReport
): Promise<void> {
  await writeFile(
    filePath,
    serializeMarketingSemanticCalibrationReport(report),
    'utf8'
  );
}

export async function readMarketingSemanticCalibrationReport(
  filePath: string
): Promise<MarketingSemanticCalibrationReport> {
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Calibration report is not valid JSON');
  }
  return parseMarketingSemanticCalibrationReport(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
