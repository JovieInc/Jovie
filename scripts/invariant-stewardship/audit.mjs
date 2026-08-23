#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function validateStewardshipAudit(audit) {
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
  if (errors.length > 0) return { ok: false, errors, findings: [] };

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
  return { ok: errors.length === 0, errors, findings };
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
    },
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

export function runStewardshipAudit(inputPath = DEFAULT_AUDIT_PATH) {
  const audit = loadStewardshipAudit(inputPath);
  const validation = validateStewardshipAudit(audit);
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
