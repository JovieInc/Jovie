/**
 * Load committed baseline-medians via static import (no sync FS — JOV-INV-031).
 * Pure parse helpers for baseline + PR/nightly sample JSON.
 */

import baselineJson from './baseline-medians.json';

import {
  ASSISTANTS_RATCHET_SCHEMA_VERSION,
  type AssistantId,
  type BaselineMedians,
  type EvalSample,
  type JankSample,
  type SafetySample,
  type SampleMode,
  type SampleSource,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertAssistantBaseline(
  value: unknown,
  label: string
): asserts value is BaselineMedians['assistants'][AssistantId] {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (value.status !== 'unrun' && value.status !== 'recorded') {
    throw new Error(`${label}.status must be "unrun" or "recorded"`);
  }
  if (value.status === 'recorded') {
    if (typeof value.median !== 'number' || !Number.isFinite(value.median)) {
      throw new Error(`${label}.median must be a finite number when recorded`);
    }
  } else if (value.median !== null) {
    throw new Error(
      `${label}.median must be null while status is unrun (refusing proxy floors)`
    );
  }
}

function readStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string') {
      throw new Error(`${label}[${index}] must be a string`);
    }
    out.push(entry);
  }
  return out;
}

/**
 * Parse and validate a baseline artifact.
 * Rejects unrun rows that accidentally lock a proxy median (e.g. 3.62).
 */
export function parseBaselineMedians(raw: unknown): BaselineMedians {
  if (!isRecord(raw)) {
    throw new Error('baseline-medians root must be an object');
  }
  if (raw.schemaVersion !== ASSISTANTS_RATCHET_SCHEMA_VERSION) {
    throw new Error(
      `baseline-medians schemaVersion must be ${ASSISTANTS_RATCHET_SCHEMA_VERSION}`
    );
  }
  if (typeof raw.rubricVersion !== 'string' || raw.rubricVersion.length === 0) {
    throw new Error(
      'baseline-medians.rubricVersion must be a non-empty string'
    );
  }
  if (!isRecord(raw.scale)) {
    throw new Error('baseline-medians.scale must be an object');
  }
  if (
    typeof raw.scale.min !== 'number' ||
    typeof raw.scale.max !== 'number' ||
    typeof raw.scale.targetMedian !== 'number'
  ) {
    throw new Error(
      'baseline-medians.scale.min/max/targetMedian must be numbers'
    );
  }
  if (!isRecord(raw.assistants)) {
    throw new Error('baseline-medians.assistants must be an object');
  }
  assertAssistantBaseline(raw.assistants.jovie, 'assistants.jovie');
  assertAssistantBaseline(raw.assistants.summer, 'assistants.summer');
  if (!isRecord(raw.jank)) {
    throw new Error('baseline-medians.jank must be an object');
  }
  if (raw.jank.status !== 'green' && raw.jank.status !== 'regressed') {
    throw new Error('baseline-medians.jank.status must be green|regressed');
  }
  const contractTests = readStringArray(
    raw.jank.contractTests,
    'baseline-medians.jank.contractTests'
  );
  const updatedAt =
    raw.updatedAt === null || typeof raw.updatedAt === 'string'
      ? raw.updatedAt
      : null;

  return {
    schemaVersion: ASSISTANTS_RATCHET_SCHEMA_VERSION,
    rubricVersion: raw.rubricVersion,
    scale: {
      min: raw.scale.min,
      max: raw.scale.max,
      targetMedian: raw.scale.targetMedian,
    },
    updatedAt,
    assistants: {
      jovie: raw.assistants.jovie,
      summer: raw.assistants.summer,
    },
    jank: {
      status: raw.jank.status,
      contractTests,
    },
  };
}

/** Committed baseline artifact (bundled at build/test time). */
export function loadBaselineMedians(): BaselineMedians {
  return parseBaselineMedians(baselineJson);
}

function parseSafety(raw: Record<string, unknown>): SafetySample {
  if (
    typeof raw.passed !== 'number' ||
    typeof raw.failed !== 'number' ||
    !Number.isInteger(raw.passed) ||
    !Number.isInteger(raw.failed)
  ) {
    throw new Error('sample.safety.passed/failed must be integers');
  }
  return {
    passed: raw.passed,
    failed: raw.failed,
    failedIds: readStringArray(raw.failedIds ?? [], 'sample.safety.failedIds'),
  };
}

function parseJank(raw: Record<string, unknown>): JankSample {
  if (typeof raw.passed !== 'boolean') {
    throw new Error('sample.jank.passed must be a boolean');
  }
  if (raw.regressions === undefined) {
    return { passed: raw.passed };
  }
  return {
    passed: raw.passed,
    regressions: readStringArray(raw.regressions, 'sample.jank.regressions'),
  };
}

function parseSampleMode(value: unknown): SampleMode {
  if (value === 'pr' || value === 'nightly') return value;
  throw new Error('sample.mode must be "pr" or "nightly"');
}

function parseSampleSource(value: unknown): SampleSource {
  if (value === 'fixture' || value === 'live' || value === 'cache') {
    return value;
  }
  throw new Error('sample.source must be fixture|live|cache');
}

function parseAssistantId(value: unknown): AssistantId {
  if (value === 'jovie' || value === 'summer') return value;
  throw new Error('sample.assistant must be "jovie" or "summer"');
}

export function parseEvalSample(raw: unknown): EvalSample {
  if (!isRecord(raw)) {
    throw new Error('eval sample root must be an object');
  }
  const assistant = parseAssistantId(raw.assistant);
  const mode = parseSampleMode(raw.mode);
  const source = parseSampleSource(raw.source);
  if (typeof raw.rubricVersion !== 'string') {
    throw new Error('sample.rubricVersion must be a string');
  }
  if (typeof raw.median !== 'number' || !Number.isFinite(raw.median)) {
    throw new Error('sample.median must be a finite number');
  }
  if (typeof raw.nCases !== 'number' || !Number.isInteger(raw.nCases)) {
    throw new Error('sample.nCases must be an integer');
  }
  if (
    typeof raw.inventedFacts !== 'number' ||
    !Number.isInteger(raw.inventedFacts)
  ) {
    throw new Error('sample.inventedFacts must be an integer');
  }
  if (!isRecord(raw.safety)) {
    throw new Error('sample.safety must be an object');
  }
  if (!isRecord(raw.jank)) {
    throw new Error('sample.jank must be an object');
  }

  const sample: EvalSample = {
    assistant,
    mode,
    source,
    rubricVersion: raw.rubricVersion,
    median: raw.median,
    nCases: raw.nCases,
    inventedFacts: raw.inventedFacts,
    safety: parseSafety(raw.safety),
    jank: parseJank(raw.jank),
  };

  if (raw.budgetExhausted === true) {
    return { ...sample, budgetExhausted: true };
  }
  if (Array.isArray(raw.caseScores)) {
    const caseScores: number[] = [];
    for (const [index, score] of raw.caseScores.entries()) {
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw new Error(`sample.caseScores[${index}] must be a finite number`);
      }
      caseScores.push(score);
    }
    return { ...sample, caseScores };
  }
  return sample;
}
