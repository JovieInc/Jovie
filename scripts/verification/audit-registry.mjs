import {
  AUDIT_DEFINITION_SCHEMA,
  AUDIT_EVIDENCE_OUTCOMES,
  AUDIT_EVIDENCE_SCHEMA,
  digestObject,
  isGitSha,
  isNonEmptyString,
  isRecord,
  isSha256,
  PROVIDER_QUALIFICATION_SCHEMA,
} from './contracts.mjs';

export const SYMPHONY_CHANGE_SAFETY_AUDIT = Object.freeze({
  schema: AUDIT_DEFINITION_SCHEMA,
  auditId: 'symphony.change-safety',
  scope: Object.freeze({
    include: Object.freeze(['scripts/backlog-orchestrator/**']),
    exclude: Object.freeze(['**/*.generated.*']),
  }),
  owner: 'summer',
  riskClass: 'high',
  deterministicTools: Object.freeze([
    'affected_tests',
    'coverage_gate',
    'structural_contracts',
  ]),
  evidenceSchema: AUDIT_EVIDENCE_SCHEMA,
  writeAuthority: 'none',
  projection: Object.freeze({ mode: 'shadow', requiredCheck: false }),
  requiredContext: Object.freeze([
    'canon/OPERATING_SYSTEM.md',
    'canon/invariants.jsonl',
    '.claude/rules/release.md',
    'docs/PR_FLOW.md',
  ]),
});

export const SHADOW_AUDIT_REGISTRY = Object.freeze([
  SYMPHONY_CHANGE_SAFETY_AUDIT,
]);

function stringList(value) {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
  );
}

function optionalStringList(value) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every(isNonEmptyString))
  );
}

function matchesPattern(path, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const expression = escaped
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${expression}$`).test(path);
}

export function validateAuditDefinition(definition) {
  const errors = [];
  if (!isRecord(definition) || definition.schema !== AUDIT_DEFINITION_SCHEMA) {
    return [`audit definition schema must be ${AUDIT_DEFINITION_SCHEMA}`];
  }
  if (!isNonEmptyString(definition.auditId)) errors.push('auditId is required');
  if (!isRecord(definition.scope) || !stringList(definition.scope.include)) {
    errors.push('scope.include must be a non-empty string list');
  }
  if (
    isRecord(definition.scope) &&
    !optionalStringList(definition.scope.exclude)
  ) {
    errors.push('scope.exclude must be a string list when present');
  }
  if (!isNonEmptyString(definition.owner)) errors.push('owner is required');
  if (!['low', 'medium', 'high', 'maximal'].includes(definition.riskClass)) {
    errors.push('riskClass is invalid');
  }
  if (!stringList(definition.deterministicTools)) {
    errors.push('deterministicTools must be a non-empty string list');
  }
  if (definition.evidenceSchema !== AUDIT_EVIDENCE_SCHEMA) {
    errors.push(`evidenceSchema must be ${AUDIT_EVIDENCE_SCHEMA}`);
  }
  if (definition.writeAuthority !== 'none') {
    errors.push('writeAuthority must be none in the shadow pilot');
  }
  if (
    definition.projection?.mode !== 'shadow' ||
    definition.projection?.requiredCheck !== false
  ) {
    errors.push('projection must remain shadow-only and non-required');
  }
  if (!stringList(definition.requiredContext)) {
    errors.push('requiredContext must be a non-empty string list');
  }
  return errors;
}

export function auditDefinitionDigest(definition) {
  const errors = validateAuditDefinition(definition);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return digestObject(definition);
}

export function resolveOwedAudits(
  changedPaths,
  definitions = SHADOW_AUDIT_REGISTRY
) {
  for (const definition of definitions) {
    const errors = validateAuditDefinition(definition);
    if (errors.length > 0) throw new Error(errors.join('\n'));
  }
  const resolvedPaths = [];
  const unmappedPaths = [];
  const owedAuditIds = new Set();

  for (const path of changedPaths) {
    const matches = definitions.filter(definition => {
      const included = definition.scope.include.some(pattern =>
        matchesPattern(path, pattern)
      );
      const excluded = (definition.scope.exclude ?? []).some(pattern =>
        matchesPattern(path, pattern)
      );
      return included && !excluded;
    });
    if (matches.length === 0) unmappedPaths.push(path);
    else {
      resolvedPaths.push(path);
      for (const match of matches) owedAuditIds.add(match.auditId);
    }
  }

  if (unmappedPaths.length > 0) {
    for (const definition of definitions) owedAuditIds.add(definition.auditId);
  }

  return {
    owedAuditIds: [...owedAuditIds].sort(),
    resolvedPaths,
    unmappedPaths,
    maximalDebt: unmappedPaths.length > 0,
    debtOutcome: unmappedPaths.length > 0 ? 'unknown' : null,
  };
}

export function validateAuditEvidenceShape(evidence) {
  const errors = [];
  if (!isRecord(evidence) || evidence.schema !== AUDIT_EVIDENCE_SCHEMA) {
    return [`audit evidence schema must be ${AUDIT_EVIDENCE_SCHEMA}`];
  }
  for (const field of ['evidenceId', 'eventId', 'auditId']) {
    if (!isNonEmptyString(evidence[field])) errors.push(`${field} is required`);
  }
  if (!AUDIT_EVIDENCE_OUTCOMES.includes(evidence.outcome)) {
    errors.push('outcome is invalid');
  }
  const subject = evidence.subject;
  if (!isRecord(subject) || !isNonEmptyString(subject.repository)) {
    errors.push('subject.repository is required');
  } else {
    for (const field of ['headSha', 'baseSha', 'mergeBaseSha']) {
      if (!isGitSha(subject[field]))
        errors.push(`subject.${field} must be exact`);
    }
    for (const field of ['patchDigest', 'requiredContextDigest']) {
      if (!isSha256(subject[field]))
        errors.push(`subject.${field} must be sha256`);
    }
    if (
      !Array.isArray(subject.artifactDigests) ||
      !subject.artifactDigests.every(isSha256)
    ) {
      errors.push('subject.artifactDigests must be a sha256 list');
    }
  }
  for (const field of [
    'auditDefinitionDigest',
    'toolDigest',
    'configDigest',
    'inputBundleDigest',
    'redactionManifestDigest',
  ]) {
    if (!isSha256(evidence[field])) errors.push(`${field} must be sha256`);
  }
  if (!isRecord(evidence.authority)) errors.push('authority is required');
  if (
    !isRecord(evidence.producer) ||
    !['deterministic', 'model'].includes(evidence.producer.kind)
  ) {
    errors.push('producer kind must be deterministic or model');
  } else if (
    evidence.producer.kind === 'model' &&
    !isSha256(evidence.producer.providerQualificationDigest)
  ) {
    errors.push('model producer qualification digest must be sha256');
  }
  if (
    evidence.modelDigest !== null &&
    evidence.modelDigest !== undefined &&
    !isSha256(evidence.modelDigest)
  ) {
    errors.push('modelDigest must be null or sha256');
  }
  if (!Array.isArray(evidence.findings)) errors.push('findings must be a list');
  if (
    evidence.supersedes !== null &&
    evidence.supersedes !== undefined &&
    !isNonEmptyString(evidence.supersedes)
  ) {
    errors.push('supersedes must be null or an evidence id');
  }
  if (
    !isNonEmptyString(evidence.startedAt) ||
    !isNonEmptyString(evidence.completedAt)
  ) {
    errors.push('timestamps are required');
  }
  return errors;
}

export function validateProviderQualificationShape(packet) {
  const errors = [];
  if (!isRecord(packet) || packet.schema !== PROVIDER_QUALIFICATION_SCHEMA) {
    return [`provider schema must be ${PROVIDER_QUALIFICATION_SCHEMA}`];
  }
  for (const field of ['provider', 'model', 'owner', 'expiresAt']) {
    if (!isNonEmptyString(packet[field])) errors.push(`${field} is required`);
  }
  for (const field of [
    'modelSnapshotDigest',
    'configDigest',
    'promptDigest',
    'bundleDigest',
  ]) {
    if (!isSha256(packet[field])) errors.push(`${field} must be sha256`);
  }
  if (!isRecord(packet.principal) || packet.principal.taskScoped !== true) {
    errors.push('principal must be task scoped');
  }
  if (!isRecord(packet.authority)) errors.push('authority is required');
  if (!isRecord(packet.dataTerms)) errors.push('dataTerms are required');
  if (!isRecord(packet.goldenPacket)) errors.push('goldenPacket is required');
  return errors;
}
