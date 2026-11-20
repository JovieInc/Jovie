#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateStewardshipSources,
  projectStewardshipEvidence,
  regenerateStewardshipAudit,
} from '../../apps/web/lib/ovie/invariant-stewardship.js';
import {
  evaluateGrowthLearning,
  GROWTH_LEARNING_INVARIANT_ID,
} from '../invariants/growth-learning-policy.mjs';
import { assertEventDrivenLearning } from '../lib/learning-trigger.mjs';
import { validateHistoricalStewardshipAudit } from './historical-audit.mjs';

// Consumer binding for JOV-INV-028: validate growth intake before projection.

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const DEFAULT_AUDIT_PATH = path.join(
  ROOT,
  'apps/web/lib/ovie/generated/invariant-stewardship.current-week.json'
);
export const CANONICAL_REGISTRY_PATH = 'canon/invariants.jsonl';
export const STEWARDSHIP_SCHEMA = 'jovie-invariant-stewardship-audit/v1';
export const GROWTH_LEARNING_INTAKE_SCHEMA = 'jovie-growth-learning-intake/v2';
const LEGACY_GROWTH_LEARNING_INTAKE_SCHEMA = 'jovie-growth-learning-intake/v1';
export const GROWTH_LEARNING_SOURCE_REVISION_DIGEST_ALGORITHM =
  'sha256:sorted-source-id-ref-revision/v1';

const GROWTH_LEARNING_PERIOD_PATTERN = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const GROWTH_LEARNING_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LEGACY_GROWTH_LEARNING_DEDUPE_PATTERN =
  /^growth-learning:\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3]):sha256:[a-f0-9]{64}$/;
const GROWTH_LEARNING_DEDUPE_PATTERN =
  /^growth-learning:v2:sha256:[a-f0-9]{64}:sha256:[a-f0-9]{64}$/;
const GROWTH_LEARNING_EVENT_KINDS = new Set([
  'evidence-threshold-crossed',
  'exception',
  'pending-job',
  'terminal-result',
]);
const GROWTH_LEARNING_MAX_SOURCES = 5;
const GROWTH_LEARNING_MAX_PROPOSALS = 1;

function notPresentGrowthLearning() {
  return {
    invariantId: GROWTH_LEARNING_INVARIANT_ID,
    status: 'not-present',
    admissionEligible: false,
    records: 0,
    dedupeKey: null,
    errors: [],
    results: [],
  };
}

function computeSourceRevisionDigest(records) {
  const entries = records.flatMap(record =>
    Array.isArray(record?.sources)
      ? record.sources.map(source => ({
          id: source?.id ?? null,
          ref: source?.ref ?? null,
          sourceRevision: source?.sourceRevision ?? null,
        }))
      : []
  );
  entries.sort((left, right) => {
    const leftKey = JSON.stringify(left);
    const rightKey = JSON.stringify(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(entries))
    .digest('hex')}`;
}

/** Identity uses the producer's stable event/revision, never delivery time. */
export function growthLearningEventDedupeKey(
  causalEvent,
  sourceRevisionDigest
) {
  if (
    !GROWTH_LEARNING_EVENT_KINDS.has(causalEvent?.kind) ||
    ![causalEvent?.id, causalEvent?.sourceRevision].every(
      value =>
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 200
    ) ||
    !GROWTH_LEARNING_DIGEST_PATTERN.test(sourceRevisionDigest ?? '')
  )
    return null;
  const eventDigest = createHash('sha256')
    .update(
      JSON.stringify([
        causalEvent.kind,
        causalEvent.id,
        causalEvent.sourceRevision,
      ])
    )
    .digest('hex');
  return `growth-learning:v2:sha256:${eventDigest}:${sourceRevisionDigest}`;
}

/**
 * Validate the optional growth-learning intake carried by the existing
 * evidence-only stewardship snapshot. This is preparation/validation only:
 * it never sends, publishes, spends, connects an account, or changes canon.
 */
export function validateGrowthLearningIntake(
  intake,
  { now = new Date(), eventName = process.env.GITHUB_EVENT_NAME } = {}
) {
  if (intake === undefined) return notPresentGrowthLearning();

  const errors = [];
  const results = [];
  if (!intake || typeof intake !== 'object' || Array.isArray(intake)) {
    return {
      ...notPresentGrowthLearning(),
      status: 'invalid',
      errors: ['growth-learning-intake-missing-or-invalid'],
    };
  }

  const historical =
    intake.schemaVersion === LEGACY_GROWTH_LEARNING_INTAKE_SCHEMA;
  if (!historical) {
    try {
      assertEventDrivenLearning(eventName);
    } catch {
      return {
        ...notPresentGrowthLearning(),
        status: 'invalid',
        errors: ['growth-learning-scheduled-intake-retired'],
      };
    }
  }
  if (!historical && intake.schemaVersion !== GROWTH_LEARNING_INTAKE_SCHEMA) {
    errors.push('growth-learning-intake-schema-invalid');
  }
  if (intake.authority !== 'evidence-only') {
    errors.push('growth-learning-intake-authority-invalid');
  }
  if (historical && !GROWTH_LEARNING_PERIOD_PATTERN.test(intake.period ?? '')) {
    errors.push('growth-learning-period-invalid');
  }
  if (!historical && intake.period !== undefined) {
    errors.push('growth-learning-period-retired');
  }
  if (
    !historical &&
    !growthLearningEventDedupeKey(
      intake.causalEvent,
      intake.sourceRevisionDigest
    )
  ) {
    errors.push('growth-learning-causal-event-invalid');
  }
  if (!GROWTH_LEARNING_DIGEST_PATTERN.test(intake.sourceDigest ?? '')) {
    errors.push('growth-learning-source-digest-invalid');
  }
  if (
    intake.sourceRevisionDigestAlgorithm !==
    GROWTH_LEARNING_SOURCE_REVISION_DIGEST_ALGORITHM
  ) {
    errors.push('growth-learning-source-revision-digest-algorithm-invalid');
  }
  if (!GROWTH_LEARNING_DIGEST_PATTERN.test(intake.sourceRevisionDigest ?? '')) {
    errors.push('growth-learning-source-revision-digest-invalid');
  }
  if (intake.maxSources !== GROWTH_LEARNING_MAX_SOURCES) {
    errors.push('growth-learning-source-limit-invalid');
  }
  if (intake.maxProposals !== GROWTH_LEARNING_MAX_PROPOSALS) {
    errors.push('growth-learning-proposal-limit-invalid');
  }
  if (intake.noDuplicateScheduler !== true) {
    errors.push('growth-learning-duplicate-scheduler-invalid');
  }

  if (!Array.isArray(intake.records)) {
    errors.push('growth-learning-records-missing');
  } else {
    if (intake.records.length > GROWTH_LEARNING_MAX_PROPOSALS) {
      errors.push('growth-learning-max-proposals-exceeded');
    }
    const recordIds = new Set();
    let sourceCount = 0;
    for (const record of intake.records) {
      const recordId = record?.id ?? '<missing>';
      if (recordIds.has(recordId)) {
        errors.push(`growth-learning-record-duplicate:${recordId}`);
      }
      recordIds.add(recordId);
      if (record?.sourceDigest !== intake.sourceDigest) {
        errors.push(`growth-learning-record-digest-mismatch:${recordId}`);
      }
      sourceCount += Array.isArray(record?.sources) ? record.sources.length : 0;

      // Weekly receipts are display-only. Do not re-evaluate stale proposals
      // into a fresh admission, including after a restart or calendar change.
      if (historical) {
        results.push({
          id: recordId,
          eligible: false,
          causalCertification: 'not-certified',
          nextAction: 'historical-only',
          warnings: ['legacy-weekly-receipt'],
        });
        continue;
      }
      let result;
      try {
        result = evaluateGrowthLearning(record, { now });
      } catch (error) {
        errors.push(
          `growth-learning-record-threw:${recordId}:${error instanceof Error ? error.message : 'unknown'}`
        );
        continue;
      }
      results.push({
        id: recordId,
        eligible: result.eligible,
        causalCertification: result.causalCertification,
        nextAction: result.nextAction,
        warnings: result.warnings,
      });
      if (!result.ok) {
        errors.push(
          `growth-learning-record-rejected:${recordId}:${result.errors.join('|')}`
        );
      }
    }
    if (sourceCount > GROWTH_LEARNING_MAX_SOURCES) {
      errors.push('growth-learning-max-sources-exceeded');
    }
    const expectedSourceRevisionDigest = computeSourceRevisionDigest(
      intake.records
    );
    if (intake.sourceRevisionDigest !== expectedSourceRevisionDigest) {
      errors.push(
        `growth-learning-source-revision-digest-mismatch:${expectedSourceRevisionDigest}`
      );
    }
  }

  const expectedDedupeKey = historical
    ? GROWTH_LEARNING_PERIOD_PATTERN.test(intake.period ?? '') &&
      GROWTH_LEARNING_DIGEST_PATTERN.test(intake.sourceRevisionDigest ?? '')
      ? `growth-learning:${intake.period}:${intake.sourceRevisionDigest}`
      : null
    : growthLearningEventDedupeKey(
        intake.causalEvent,
        intake.sourceRevisionDigest
      );
  if (intake.dedupeKey !== expectedDedupeKey) {
    errors.push('growth-learning-dedupe-key-invalid');
  }
  if (!Array.isArray(intake.priorDedupeKeys)) {
    errors.push('growth-learning-prior-dedupe-keys-missing');
  } else {
    const priorKeys = new Set();
    for (const key of intake.priorDedupeKeys) {
      if (
        !GROWTH_LEARNING_DEDUPE_PATTERN.test(key ?? '') &&
        !LEGACY_GROWTH_LEARNING_DEDUPE_PATTERN.test(key ?? '')
      ) {
        errors.push(`growth-learning-prior-dedupe-key-invalid:${key}`);
      }
      if (priorKeys.has(key)) {
        errors.push(`growth-learning-prior-dedupe-key-duplicate:${key}`);
      }
      priorKeys.add(key);
    }
    if (expectedDedupeKey && priorKeys.has(expectedDedupeKey)) {
      errors.push(`growth-learning-duplicate-dedupe-key:${expectedDedupeKey}`);
    }
  }

  return {
    invariantId: GROWTH_LEARNING_INVARIANT_ID,
    status:
      errors.length > 0
        ? 'invalid'
        : historical
          ? 'historical'
          : intake.records?.length
            ? 'validated'
            : 'empty',
    admissionEligible:
      !historical &&
      errors.length === 0 &&
      results.some(result => result.eligible),
    records: Array.isArray(intake.records) ? intake.records.length : 0,
    dedupeKey: intake.dedupeKey ?? null,
    errors: [...new Set(errors)],
    results,
  };
}

export function loadCanonicalSource() {
  try {
    return fs.readFileSync(path.join(ROOT, CANONICAL_REGISTRY_PATH), 'utf8');
  } catch {
    return null;
  }
}

export function validateStewardshipAudit(
  audit,
  { now = new Date(), canonicalSource = loadCanonicalSource() } = {}
) {
  const evidence = evaluateStewardshipSources(audit, canonicalSource, { now });
  const historical =
    audit?.schemaVersion === STEWARDSHIP_SCHEMA
      ? validateHistoricalStewardshipAudit(audit)
      : { ok: evidence.state === 'verified', errors: [], findings: [] };
  const growthLearning = validateGrowthLearningIntake(
    audit?.growthLearningIntake,
    { now }
  );
  const errors = [
    ...historical.errors,
    ...evidence.errors,
    ...growthLearning.errors.map(
      error => `${GROWTH_LEARNING_INVARIANT_ID}: ${error}`
    ),
  ];
  const ok =
    historical.ok && evidence.state === 'verified' && errors.length === 0;
  if (!ok && growthLearning.status !== 'historical') {
    growthLearning.admissionEligible = false;
    growthLearning.results = growthLearning.results.map(result => ({
      ...result,
      eligible: false,
      nextAction: 'verify-stewardship-source',
    }));
  }
  return {
    ok,
    evaluatedAt: now.toISOString(),
    shapeValid: historical.ok,
    errors,
    evidence,
    findings: evidence.state === 'verified' ? evidence.findings : [],
    historicalFindings: historical.findings,
    growthLearning,
  };
}

export function projectStewardshipAudit(
  audit,
  validation = validateStewardshipAudit(audit),
  canonicalSource = loadCanonicalSource()
) {
  const projection = projectStewardshipEvidence(audit, canonicalSource, {
    now: new Date(validation.evaluatedAt),
  });
  return {
    ...projection,
    summary: {
      ...projection.summary,
      growthLearningRecords: validation.growthLearning.records,
    },
    growthLearning: validation.growthLearning,
  };
}

export function loadStewardshipAudit(inputPath = DEFAULT_AUDIT_PATH) {
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

export function runStewardshipAudit(
  inputPath = DEFAULT_AUDIT_PATH,
  { now = new Date(), canonicalSource = loadCanonicalSource() } = {}
) {
  const audit = loadStewardshipAudit(inputPath);
  const validation = validateStewardshipAudit(audit, { now, canonicalSource });
  return {
    audit,
    validation,
    projection: projectStewardshipAudit(audit, validation, canonicalSource),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputIndex = process.argv.indexOf('--input');
  const inputPath =
    inputIndex >= 0
      ? path.resolve(process.argv[inputIndex + 1])
      : DEFAULT_AUDIT_PATH;
  if (process.argv.includes('--regenerate')) {
    const option = name => {
      const index = process.argv.indexOf(name);
      return index < 0 ? undefined : process.argv[index + 1];
    };
    // Candidate only: the existing persisted latest is advanced by its owner.
    const receipt = regenerateStewardshipAudit(loadCanonicalSource(), {
      causalEvent: {
        kind: option('--event-kind'),
        id: option('--event-id'),
        sourceRevision: option('--event-revision'),
      },
      generatedAt: new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exit(0);
  }
  const result = runStewardshipAudit(inputPath);
  process.stdout.write(`${JSON.stringify(result.projection, null, 2)}\n`);
  if (!result.validation.ok) {
    for (const error of result.validation.errors) {
      process.stderr.write(`ERROR ${error}\n`);
    }
    process.exitCode = 1;
  }
}
