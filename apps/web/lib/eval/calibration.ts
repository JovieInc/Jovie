/**
 * LLM-as-judge calibration: human holdout loader + Cohen's kappa gate (JOV-3663).
 *
 * Compares human reviewer labels on a fixed holdout set against LLM judge
 * labels and blocks promotion when inter-rater agreement falls below threshold.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HUMAN_HOLDOUT_SCHEMA_VERSION = 1 as const;

export const DEFAULT_KAPPA_THRESHOLD = 0.6;

export type JudgeBinaryLabel = 'pass' | 'fail';

export interface HumanHoldoutItem {
  /** Stable holdout row identifier. */
  readonly id: string;
  /** Golden-case name or trace id the label refers to. */
  readonly caseId: string;
  readonly humanLabel: JudgeBinaryLabel;
  readonly notes?: string;
}

export interface HumanHoldoutSet {
  readonly schemaVersion: typeof HUMAN_HOLDOUT_SCHEMA_VERSION;
  /** ISO-8601 timestamp when the holdout was last curated. */
  readonly labeledAt: string;
  readonly items: readonly HumanHoldoutItem[];
}

export type JudgeLabelMap = Readonly<Record<string, JudgeBinaryLabel>>;

export interface PairedJudgeLabel {
  readonly id: string;
  readonly caseId: string;
  readonly humanLabel: JudgeBinaryLabel;
  readonly judgeLabel: JudgeBinaryLabel;
}

export interface CohensKappaResult {
  readonly kappa: number;
  readonly observedAgreement: number;
  readonly expectedAgreement: number;
  readonly pairedCount: number;
}

export interface CalibrationGateResult {
  readonly passed: boolean;
  readonly kappa: number;
  readonly threshold: number;
  readonly pairedCount: number;
  readonly observedAgreement: number;
  readonly expectedAgreement: number;
  readonly disagreements: readonly PairedJudgeLabel[];
}

export class CalibrationGateError extends Error {
  readonly result: CalibrationGateResult;

  constructor(message: string, result: CalibrationGateResult) {
    super(message);
    this.name = 'CalibrationGateError';
    this.result = result;
  }
}

const JUDGE_LABELS: ReadonlySet<string> = new Set(['pass', 'fail']);

const DEFAULT_HOLDOUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'holdout.json'
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertJudgeLabel(
  value: unknown,
  field: string,
  itemId: string
): JudgeBinaryLabel {
  if (typeof value !== 'string' || !JUDGE_LABELS.has(value)) {
    throw new Error(
      `Holdout item "${itemId}" has invalid ${field}: expected "pass" or "fail"`
    );
  }

  return value as JudgeBinaryLabel;
}

export function parseHumanHoldoutSet(raw: unknown): HumanHoldoutSet {
  if (!isRecord(raw)) {
    throw new Error('Holdout set must be a JSON object');
  }

  if (raw.schemaVersion !== HUMAN_HOLDOUT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported holdout schemaVersion: expected ${HUMAN_HOLDOUT_SCHEMA_VERSION}`
    );
  }

  if (typeof raw.labeledAt !== 'string' || raw.labeledAt.trim().length === 0) {
    throw new Error('Holdout set requires a non-empty labeledAt timestamp');
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('Holdout set requires at least one labeled item');
  }

  const seenIds = new Set<string>();
  const items: HumanHoldoutItem[] = [];

  for (const entry of raw.items) {
    if (!isRecord(entry)) {
      throw new Error('Each holdout item must be an object');
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const caseId = typeof entry.caseId === 'string' ? entry.caseId.trim() : '';

    if (!id) {
      throw new Error('Holdout item is missing id');
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate holdout id: ${id}`);
    }
    seenIds.add(id);

    if (!caseId) {
      throw new Error(`Holdout item "${id}" is missing caseId`);
    }

    const humanLabel = assertJudgeLabel(entry.humanLabel, 'humanLabel', id);
    const notes =
      entry.notes === undefined
        ? undefined
        : typeof entry.notes === 'string'
          ? entry.notes
          : (() => {
              throw new Error(`Holdout item "${id}" has invalid notes`);
            })();

    items.push({ id, caseId, humanLabel, notes });
  }

  return {
    schemaVersion: HUMAN_HOLDOUT_SCHEMA_VERSION,
    labeledAt: raw.labeledAt,
    items,
  };
}

export function loadHumanHoldoutSet(
  filePath: string = DEFAULT_HOLDOUT_PATH
): HumanHoldoutSet {
  const raw = readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return parseHumanHoldoutSet(parsed);
}

export function pairHoldoutLabels(
  holdout: HumanHoldoutSet,
  judgeLabels: JudgeLabelMap
): {
  readonly paired: readonly PairedJudgeLabel[];
  readonly missingJudgeLabels: readonly string[];
} {
  const paired: PairedJudgeLabel[] = [];
  const missingJudgeLabels: string[] = [];

  for (const item of holdout.items) {
    const judgeLabel = judgeLabels[item.id] ?? judgeLabels[item.caseId];
    if (!judgeLabel) {
      missingJudgeLabels.push(item.id);
      continue;
    }

    paired.push({
      id: item.id,
      caseId: item.caseId,
      humanLabel: item.humanLabel,
      judgeLabel,
    });
  }

  return { paired, missingJudgeLabels };
}

export function computeCohensKappa(
  raterA: readonly string[],
  raterB: readonly string[]
): CohensKappaResult {
  if (raterA.length !== raterB.length) {
    throw new Error('Rater label arrays must have equal length');
  }

  const n = raterA.length;
  if (n === 0) {
    throw new Error("Cannot compute Cohen's kappa on an empty sample");
  }

  const categories = [...new Set([...raterA, ...raterB])];
  const index = new Map(categories.map((label, i) => [label, i] as const));
  const counts = Array.from({ length: categories.length }, () =>
    Array.from({ length: categories.length }, () => 0)
  );

  for (let i = 0; i < n; i += 1) {
    const a = index.get(raterA[i]);
    const b = index.get(raterB[i]);
    if (a === undefined || b === undefined) {
      throw new Error(
        'Encountered unknown category while building confusion matrix'
      );
    }
    counts[a][b] += 1;
  }

  let observedAgreement = 0;
  for (let i = 0; i < categories.length; i += 1) {
    observedAgreement += counts[i][i];
  }
  observedAgreement /= n;

  const rowTotals = counts.map(row =>
    row.reduce((sum, value) => sum + value, 0)
  );
  const colTotals = categories.map((_, colIndex) =>
    counts.reduce((sum, row) => sum + row[colIndex], 0)
  );

  let expectedAgreement = 0;
  for (let i = 0; i < categories.length; i += 1) {
    expectedAgreement += rowTotals[i] * colTotals[i];
  }
  expectedAgreement /= n * n;

  if (expectedAgreement === 1) {
    return {
      kappa: observedAgreement === 1 ? 1 : Number.NaN,
      observedAgreement,
      expectedAgreement,
      pairedCount: n,
    };
  }

  const kappa =
    (observedAgreement - expectedAgreement) / (1 - expectedAgreement);

  return {
    kappa,
    observedAgreement,
    expectedAgreement,
    pairedCount: n,
  };
}

export function computeHoldoutKappa(
  paired: readonly PairedJudgeLabel[]
): CohensKappaResult {
  return computeCohensKappa(
    paired.map(item => item.humanLabel),
    paired.map(item => item.judgeLabel)
  );
}

export function runJudgeCalibrationGate(input: {
  readonly holdout: HumanHoldoutSet;
  readonly judgeLabels: JudgeLabelMap;
  readonly threshold?: number;
}): CalibrationGateResult {
  const threshold = input.threshold ?? DEFAULT_KAPPA_THRESHOLD;
  const { paired, missingJudgeLabels } = pairHoldoutLabels(
    input.holdout,
    input.judgeLabels
  );

  if (missingJudgeLabels.length > 0) {
    throw new Error(
      `Missing judge labels for holdout ids: ${missingJudgeLabels.join(', ')}`
    );
  }

  const kappaResult = computeHoldoutKappa(paired);
  const disagreements = paired.filter(
    item => item.humanLabel !== item.judgeLabel
  );

  return {
    passed: kappaResult.kappa >= threshold,
    kappa: kappaResult.kappa,
    threshold,
    pairedCount: kappaResult.pairedCount,
    observedAgreement: kappaResult.observedAgreement,
    expectedAgreement: kappaResult.expectedAgreement,
    disagreements,
  };
}

export function assertJudgeCalibrationGate(input: {
  readonly holdout: HumanHoldoutSet;
  readonly judgeLabels: JudgeLabelMap;
  readonly threshold?: number;
}): CalibrationGateResult {
  const result = runJudgeCalibrationGate(input);

  if (!result.passed) {
    throw new CalibrationGateError(
      `Judge calibration gate failed: Cohen's kappa ${result.kappa.toFixed(3)} is below threshold ${result.threshold}`,
      result
    );
  }

  return result;
}
