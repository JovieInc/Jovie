#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateGrowthLearning,
  GROWTH_LEARNING_INVARIANT_ID,
} from '../invariants/growth-learning-policy.mjs';

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
export const GROWTH_LEARNING_INTAKE_SCHEMA = 'jovie-growth-learning-intake/v1';

const GROWTH_LEARNING_PERIOD_PATTERN = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const GROWTH_LEARNING_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const GROWTH_LEARNING_DEDUPE_PATTERN =
  /^growth-learning:\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3]):sha256:[a-f0-9]{64}$/;
const GROWTH_LEARNING_MAX_SOURCES = 5;
const GROWTH_LEARNING_MAX_PROPOSALS = 1;

const CLASSIFICATIONS = new Set([
  'approved',
  'inferred',
  'proposed',
  'superseded',
  'conflicting',
  'missing-consumer',
  'unknown',
]);

const APPROVED_AUTHORITY = new Set([
  'approved',
  'founder-approved',
  'approved-operating-rule',
]);

const FOUNDER_DECISION_KINDS = new Set([
  'spend',
  'legal-external-send',
  'credentials-permissions',
  'taste',
  'contradictory-correctness',
]);

function overlap(left, right) {
  return left.some(value => right.includes(value));
}

function scopeSeparated(left, right) {
  return (
    left.relations.scopeSeparated.includes(right.id) ||
    right.relations.scopeSeparated.includes(left.id)
  );
}

function superseded(left, right) {
  return (
    left.relations.supersedes.includes(right.id) ||
    right.relations.supersedes.includes(left.id)
  );
}

function requireString(value, label, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} is required`);
  }
}

function requireDate(value, label, errors) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${label} must be an ISO date`);
  }
}

function pairId(kind, left, right) {
  return `${kind}:${[left.id, right.id].sort().join(':')}`;
}

function notPresentGrowthLearning() {
  return {
    invariantId: GROWTH_LEARNING_INVARIANT_ID,
    status: 'not-present',
    records: 0,
    dedupeKey: null,
    errors: [],
    results: [],
  };
}

/**
 * Validate the optional growth-learning intake carried by the existing
 * evidence-only stewardship snapshot. This is preparation/validation only:
 * it never sends, publishes, spends, connects an account, or changes canon.
 */
export function validateGrowthLearningIntake(
  intake,
  { now = new Date() } = {}
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

  if (intake.schemaVersion !== GROWTH_LEARNING_INTAKE_SCHEMA) {
    errors.push('growth-learning-intake-schema-invalid');
  }
  if (intake.authority !== 'evidence-only') {
    errors.push('growth-learning-intake-authority-invalid');
  }
  if (!GROWTH_LEARNING_PERIOD_PATTERN.test(intake.period ?? '')) {
    errors.push('growth-learning-period-invalid');
  }
  if (!GROWTH_LEARNING_DIGEST_PATTERN.test(intake.sourceDigest ?? '')) {
    errors.push('growth-learning-source-digest-invalid');
  }
  const expectedDedupeKey =
    GROWTH_LEARNING_PERIOD_PATTERN.test(intake.period ?? '') &&
    GROWTH_LEARNING_DIGEST_PATTERN.test(intake.sourceDigest ?? '')
      ? `growth-learning:${intake.period}:${intake.sourceDigest}`
      : null;
  if (intake.dedupeKey !== expectedDedupeKey) {
    errors.push('growth-learning-dedupe-key-invalid');
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

  if (!Array.isArray(intake.priorDedupeKeys)) {
    errors.push('growth-learning-prior-dedupe-keys-missing');
  } else {
    const priorKeys = new Set();
    for (const key of intake.priorDedupeKeys) {
      if (!GROWTH_LEARNING_DEDUPE_PATTERN.test(key ?? '')) {
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
  }

  return {
    invariantId: GROWTH_LEARNING_INVARIANT_ID,
    status:
      errors.length > 0
        ? 'invalid'
        : intake.records?.length
          ? 'validated'
          : 'empty',
    records: Array.isArray(intake.records) ? intake.records.length : 0,
    dedupeKey: intake.dedupeKey ?? null,
    errors: [...new Set(errors)],
    results,
  };
}

function computedFindings(audit, errors) {
  const findings = [];
  const ids = new Set();
  const byId = new Map();

  for (const candidate of audit.candidates) {
    requireString(candidate.id, 'candidate.id', errors);
    if (ids.has(candidate.id)) {
      errors.push(`duplicate candidate id: ${candidate.id}`);
    }
    ids.add(candidate.id);
    byId.set(candidate.id, candidate);

    for (const field of [
      'statement',
      'semanticKey',
      'semanticValue',
      'owner',
      'authorityStatus',
      'implementationAuthority',
      'lifecycle',
    ]) {
      requireString(candidate[field], `${candidate.id}.${field}`, errors);
    }
    if (!CLASSIFICATIONS.has(candidate.classification)) {
      errors.push(
        `${candidate.id}.classification is invalid: ${candidate.classification}`
      );
    }
    if (!Array.isArray(candidate.scope) || candidate.scope.length === 0) {
      errors.push(`${candidate.id}.scope is required`);
    }
    if (
      !Array.isArray(candidate.provenance) ||
      candidate.provenance.length === 0
    ) {
      errors.push(`${candidate.id}.provenance is required`);
    }
    requireString(
      candidate.source?.kind,
      `${candidate.id}.source.kind`,
      errors
    );
    requireString(candidate.source?.ref, `${candidate.id}.source.ref`, errors);
    requireDate(candidate.source?.date, `${candidate.id}.source.date`, errors);
    if (!Array.isArray(candidate.consumers)) {
      errors.push(`${candidate.id}.consumers must be an array`);
    }
    if (!Array.isArray(candidate.tests)) {
      errors.push(`${candidate.id}.tests must be an array`);
    }
    if (!candidate.relations || typeof candidate.relations !== 'object') {
      errors.push(`${candidate.id}.relations is required`);
      continue;
    }
    for (const rel of [
      'overlaps',
      'conflicts',
      'supersedes',
      'scopeSeparated',
    ]) {
      if (!Array.isArray(candidate.relations[rel])) {
        errors.push(`${candidate.id}.relations.${rel} must be an array`);
      }
    }

    if (APPROVED_AUTHORITY.has(candidate.authorityStatus)) {
      const activeConsumer = (candidate.consumers || []).some(
        item => item.status === 'active'
      );
      const activeRed = (candidate.tests || []).some(
        item => item.status === 'active' && item.kind === 'deliberate-red'
      );
      if (!activeConsumer || !activeRed) {
        findings.push({
          id: `missing-consumer:${candidate.id}`,
          kind: 'missing-consumer',
          candidateIds: [candidate.id],
        });
      }
    }
    if (
      candidate.classification === 'unknown' ||
      candidate.authorityStatus === 'unknown' ||
      candidate.authorityStatus === 'refresh-required'
    ) {
      findings.push({
        id: `unknown-authority:${candidate.id}`,
        kind: 'unknown',
        candidateIds: [candidate.id],
      });
    }
  }

  for (const candidate of audit.candidates) {
    for (const target of candidate.relations?.supersedes || []) {
      if (!byId.has(target)) {
        errors.push(`${candidate.id}: supersedes unknown ${target}`);
        continue;
      }
      const supersededCandidate = byId.get(target);
      if (supersededCandidate.classification !== 'superseded') {
        findings.push({
          id: `supersession:${candidate.id}:${target}`,
          kind: 'supersession',
          candidateIds: [candidate.id, target],
        });
      }
    }
  }

  for (let index = 0; index < audit.candidates.length; index += 1) {
    const left = audit.candidates[index];
    for (const right of audit.candidates.slice(index + 1)) {
      if (
        left.semanticKey !== right.semanticKey ||
        !overlap(left.scope || [], right.scope || [])
      ) {
        continue;
      }
      // Same-key overlapping scope is the overlap detector. Compatible values
      // are duplicates; contradictory values without supersession or an
      // explicit scope split are conflicts.
      if (left.semanticValue === right.semanticValue) {
        findings.push({
          id: pairId('duplicate', left, right),
          kind: 'duplicate',
          candidateIds: [left.id, right.id].sort(),
        });
        continue;
      }
      if (!scopeSeparated(left, right) && !superseded(left, right)) {
        findings.push({
          id: pairId('conflict', left, right),
          kind: 'conflicting',
          candidateIds: [left.id, right.id].sort(),
        });
      }
    }
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

export function validateStewardshipAudit(audit, { now = new Date() } = {}) {
  const errors = [];
  if (audit?.schemaVersion !== STEWARDSHIP_SCHEMA) {
    errors.push('unsupported schemaVersion');
  }
  if (audit?.authority !== 'evidence-only') {
    errors.push('audit must declare evidence-only authority');
  }
  if (audit?.canonicalRegistry?.path !== CANONICAL_REGISTRY_PATH) {
    errors.push(
      `canonical registry path must remain ${CANONICAL_REGISTRY_PATH}`
    );
  }
  if (
    !Array.isArray(audit?.sources) ||
    !audit.sources.some(
      source => source.kind === 'gbrain' && source.status === 'covered'
    )
  ) {
    errors.push('covered gbrain source is required');
  }
  if (
    Array.isArray(audit?.sources) &&
    audit.sources.some(source => source.kind === 'personal-communications') &&
    audit.sources.some(
      source =>
        source.kind === 'personal-communications' &&
        source.status !== 'excluded'
    )
  ) {
    errors.push('personal communications must remain excluded');
  }
  if (!Array.isArray(audit?.candidates))
    errors.push('candidates must be an array');
  if (!Array.isArray(audit?.declaredFindings)) {
    errors.push('declaredFindings must be an array');
  }
  if (!Array.isArray(audit?.founderQueue)) {
    errors.push('founderQueue must be an array');
  }
  const coreErrors = errors.length;
  const growthLearning = validateGrowthLearningIntake(
    audit?.growthLearningIntake,
    { now }
  );
  for (const error of growthLearning.errors) {
    errors.push(`${GROWTH_LEARNING_INVARIANT_ID}: ${error}`);
  }
  if (coreErrors > 0) {
    return { ok: false, errors, findings: [], growthLearning };
  }

  const findings = computedFindings(audit, errors);
  const declared = audit.declaredFindings.map(item => item.id).sort();
  const computed = findings.map(item => item.id).sort();
  if (JSON.stringify(declared) !== JSON.stringify(computed)) {
    errors.push(
      `declared findings drift: expected [${computed.join(', ')}], received [${declared.join(', ')}]`
    );
  }
  for (const question of audit.founderQueue) {
    if (!FOUNDER_DECISION_KINDS.has(question.kind)) {
      errors.push(
        `founderQueue contains non-founder decision kind: ${question.kind}`
      );
    }
    if (!Array.isArray(question.evidence) || question.evidence.length === 0) {
      errors.push(`founderQueue ${question.id} needs evidence`);
    }
  }
  return { ok: errors.length === 0, errors, findings, growthLearning };
}

export function projectStewardshipAudit(
  audit,
  validation = validateStewardshipAudit(audit)
) {
  const declaredById = new Map(
    (audit.declaredFindings || []).map(item => [item.id, item])
  );
  return {
    schemaVersion: audit.schemaVersion,
    generatedAt: audit.generatedAt,
    window: audit.window,
    canonicalRegistry: audit.canonicalRegistry,
    summary: {
      candidates: audit.candidates.length,
      actionableExceptions: validation.findings.length,
      founderDecisions: audit.founderQueue.length,
      sourceGaps: (audit.sources || []).filter(
        source => source.status !== 'covered' && source.status !== 'excluded'
      ).length,
      growthLearningRecords: validation.growthLearning?.records ?? 0,
    },
    growthLearning: validation.growthLearning ?? notPresentGrowthLearning(),
    actionableExceptions: validation.findings.map(finding => ({
      ...finding,
      owner: declaredById.get(finding.id)?.owner ?? 'summer',
      action:
        declaredById.get(finding.id)?.action ??
        'Reconcile and declare the disposition.',
    })),
    founderQueue: audit.founderQueue,
    drillDown:
      'apps/web/lib/ovie/generated/invariant-stewardship.current-week.json',
  };
}

export function loadStewardshipAudit(inputPath = DEFAULT_AUDIT_PATH) {
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

export function runStewardshipAudit(
  inputPath = DEFAULT_AUDIT_PATH,
  { now = new Date() } = {}
) {
  const audit = loadStewardshipAudit(inputPath);
  const validation = validateStewardshipAudit(audit, { now });
  return {
    audit,
    validation,
    projection: projectStewardshipAudit(audit, validation),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputIndex = process.argv.indexOf('--input');
  const inputPath =
    inputIndex >= 0
      ? path.resolve(process.argv[inputIndex + 1])
      : DEFAULT_AUDIT_PATH;
  const result = runStewardshipAudit(inputPath);
  process.stdout.write(`${JSON.stringify(result.projection, null, 2)}\n`);
  if (!result.validation.ok) {
    for (const error of result.validation.errors) {
      process.stderr.write(`ERROR ${error}\n`);
    }
    process.exitCode = 1;
  }
}
