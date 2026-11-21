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
  if (!isRecord(raw.assistants)) {
    throw new Error('baseline-medians.assistants must be an object');
  }
  assertAssistantBaseline(raw.assistants.jovie, 'assistants.jovie');
  assertAssistantBaseline(raw.assistants.summer, 'assistants.summer');
  if (!isRecord(raw.jank) || !Array.isArray(raw.jank.contractTests)) {
    throw new Error('baseline-medians.jank.contractTests must be an array');
  }
  return raw as unknown as BaselineMedians;
}

/** Committed baseline artifact (bundled at build/test time). */
export function loadBaselineMedians(): BaselineMedians {
  return parseBaselineMedians(baselineJson);
}

export function parseEvalSample(raw: unknown): EvalSample {
  if (!isRecord(raw)) {
    throw new Error('eval sample root must be an object');
  }
  if (raw.assistant !== 'jovie' && raw.assistant !== 'summer') {
    throw new Error('sample.assistant must be "jovie" or "summer"');
  }
  if (raw.mode !== 'pr' && raw.mode !== 'nightly') {
    throw new Error('sample.mode must be "pr" or "nightly"');
  }
  if (
    raw.source !== 'fixture' &&
    raw.source !== 'live' &&
    raw.source !== 'cache'
  ) {
    throw new Error('sample.source must be fixture|live|cache');
  }
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
  if (!isRecord(raw.jank) || typeof raw.jank.passed !== 'boolean') {
    throw new Error('sample.jank.passed must be a boolean');
  }
  return raw as unknown as EvalSample;
}
