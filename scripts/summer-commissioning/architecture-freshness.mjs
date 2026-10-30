import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import {
  isRecord,
  requireIsoTimestamp,
  requireString,
  requireStringArray,
  SAFE_GIT_SHA,
} from './receipt-trust.mjs';

export const ARCHITECTURE_FRESHNESS_SCHEMA =
  'jovie.architecture-freshness-registry/v1';

const RECORD_STATUSES = new Set(['current', 'superseded']);
const CONTEXT_CLASSIFICATIONS = new Set(['current', 'historical']);
const RETIRED_COMPONENTS = new Set(['Hermes', 'Trigger.dev']);
const ACTIVE_RETIRED_CLAIMS = [
  /\b(?:Summer|Jovie|AgentOS)\s+(?:uses?|runs?|routes?|depends?)\b[^.\n]{0,100}\bHermes\b/iu,
  /\bHermes\b[^.\n]{0,100}\b(?:is|remains|serves as)\s+(?:the\s+)?(?:active|current|runtime|fallback|adapter)/iu,
  /\bTrigger\.dev\b[^.\n]{0,100}\b(?:is|remains|serves as|stays)\s+(?:the\s+)?(?:active|current|runner|runtime|fallback)/iu,
  /\b(?:uses?|runs?|routes?|depends?)\b[^.\n]{0,100}\bTrigger\.dev\b/iu,
];

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`);
  return value;
}

function assertSafeRepositoryPath(path, field) {
  requireString(path, field);
  if (isAbsolute(path) || path.split(/[\\/]/u).includes('..')) {
    throw new Error(`${field} must stay inside the repository`);
  }
}

export function validateContextText(
  { classification, requiredMarker },
  text,
  field = 'context'
) {
  if (!CONTEXT_CLASSIFICATIONS.has(classification)) {
    throw new Error(`${field}.classification is invalid`);
  }
  requireString(requiredMarker, `${field}.requiredMarker`);
  if (!text.includes(requiredMarker)) {
    throw new Error(`${field} is missing required freshness marker`);
  }
  if (classification === 'historical') return text;

  for (const pattern of ACTIVE_RETIRED_CLAIMS) {
    if (pattern.test(text)) {
      throw new Error(`${field} actively claims retired tooling`);
    }
  }
  return text;
}

export function validateArchitectureRegistry(registry) {
  if (!isRecord(registry)) throw new Error('registry must be an object');
  if (registry.schema !== ARCHITECTURE_FRESHNESS_SCHEMA) {
    throw new Error(`registry.schema must be ${ARCHITECTURE_FRESHNESS_SCHEMA}`);
  }
  requireString(registry.registryRevision, 'registry.registryRevision');
  requireString(registry.issue, 'registry.issue');
  requireString(registry.owner, 'registry.owner');
  requireString(registry.environment, 'registry.environment');
  if (!SAFE_GIT_SHA.test(registry.sourceRevision ?? '')) {
    throw new Error('registry.sourceRevision must be an exact git SHA');
  }
  const effectiveAt = requireIsoTimestamp(
    registry.effectiveAt,
    'registry.effectiveAt'
  );
  const refreshBy = requireIsoTimestamp(
    registry.refreshBy,
    'registry.refreshBy'
  );
  if (Date.parse(refreshBy) <= Date.parse(effectiveAt)) {
    throw new Error('registry.refreshBy must follow registry.effectiveAt');
  }
  requireString(registry.evidenceTier, 'registry.evidenceTier');
  if (!RECORD_STATUSES.has(registry.status)) {
    throw new Error('registry.status is invalid');
  }
  assertSafeRepositoryPath(
    registry.canonicalRecord,
    'registry.canonicalRecord'
  );
  requireStringArray(registry.supersedes, 'registry.supersedes');

  if (!isRecord(registry.runtimeTarget)) {
    throw new Error('registry.runtimeTarget must be an object');
  }
  if (registry.runtimeTarget.name !== 'Eve') {
    throw new Error('registry.runtimeTarget.name must be Eve');
  }
  requireString(registry.runtimeTarget.state, 'registry.runtimeTarget.state');
  requireBoolean(
    registry.runtimeTarget.certified,
    'registry.runtimeTarget.certified'
  );
  requireString(
    registry.runtimeTarget.blocker,
    'registry.runtimeTarget.blocker'
  );
  if (
    registry.runtimeTarget.state.startsWith('blocked') &&
    registry.runtimeTarget.certified
  ) {
    throw new Error('a blocked runtime target cannot be certified');
  }

  if (!Array.isArray(registry.retiredComponents)) {
    throw new Error('registry.retiredComponents must be an array');
  }
  const retired = new Set();
  for (const [index, component] of registry.retiredComponents.entries()) {
    const field = `registry.retiredComponents[${index}]`;
    if (!isRecord(component)) throw new Error(`${field} must be an object`);
    const name = requireString(component.name, `${field}.name`);
    retired.add(name);
    requireIsoTimestamp(component.effectiveAt, `${field}.effectiveAt`);
    if (component.rollbackAllowed !== false) {
      throw new Error(`${field}.rollbackAllowed must be false`);
    }
  }
  for (const required of RETIRED_COMPONENTS) {
    if (!retired.has(required)) {
      throw new Error(`registry must retire ${required}`);
    }
  }

  if (!Array.isArray(registry.contextDocuments)) {
    throw new Error('registry.contextDocuments must be an array');
  }
  const paths = new Set();
  for (const [index, document] of registry.contextDocuments.entries()) {
    const field = `registry.contextDocuments[${index}]`;
    if (!isRecord(document)) throw new Error(`${field} must be an object`);
    assertSafeRepositoryPath(document.path, `${field}.path`);
    if (paths.has(document.path)) {
      throw new Error(`duplicate context document ${document.path}`);
    }
    paths.add(document.path);
    if (!CONTEXT_CLASSIFICATIONS.has(document.classification)) {
      throw new Error(`${field}.classification is invalid`);
    }
    requireString(document.requiredMarker, `${field}.requiredMarker`);
  }
  if (!paths.has(registry.canonicalRecord)) {
    throw new Error('canonical record must be a context document');
  }
  return registry;
}

export function selectCurrentArchitecture(registries, nowMs = Date.now()) {
  const current = registries
    .map(validateArchitectureRegistry)
    .filter(registry => registry.status === 'current');
  const fresh = current.filter(
    registry => Date.parse(registry.refreshBy) > nowMs
  );
  if (fresh.length === 0) {
    throw new Error('no fresh current architecture record');
  }
  if (fresh.length > 1) {
    throw new Error('conflicting current architecture records');
  }
  return {
    registry: fresh[0],
    runtimeTargetCertified: fresh[0].runtimeTarget.certified,
    staleRecords: current.filter(
      registry => Date.parse(registry.refreshBy) <= nowMs
    ),
  };
}

export function validateArchitectureBindings(registry, repositoryRoot) {
  validateArchitectureRegistry(registry);
  for (const [index, document] of registry.contextDocuments.entries()) {
    const absolutePath = resolve(repositoryRoot, document.path);
    validateContextText(
      document,
      readFileSync(absolutePath, 'utf8'),
      `registry.contextDocuments[${index}]`
    );
  }
  return registry;
}
