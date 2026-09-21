import { createHash } from 'node:crypto';
import {
  canonicalJson,
  isRecord,
  requireIsoTimestamp,
  requireString,
} from './receipt-trust.mjs';

/** @typedef {'repository'|'service'|'work'|'deployment'|'infrastructure'} CompanyObjectType */
/**
 * Source-owned, non-certifying projection. Runtime observations are separate inputs.
 * @typedef {object} CompanyObject
 * @property {string} id Stable identity, independent of display names or deployment IDs.
 * @property {CompanyObjectType} type
 * @property {string} owner
 * @property {string} purpose
 * @property {{repository:string,path:string}} authority Source pointer, never private content.
 * @property {string[]} dependencies
 * @property {string[]} capabilities References into the existing access/commissioning registries.
 * @property {Record<string,string>} attributes Kind-specific identity, not a certificate.
 */
export const COMPANY_SCHEMA = 'jovie.company-asset-projection/v1';
const TYPES = ['repository', 'service', 'work', 'deployment', 'infrastructure'];
const ID = /^[a-z][a-z0-9.-]{2,119}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ATTRIBUTES = {
  repository: ['slug'],
  service: ['repositoryId', 'identityPath'],
  work: ['serviceId', 'issue'],
  deployment: ['serviceId', 'environment', 'projectId', 'endpoint', 'role'],
  infrastructure: ['provider'],
};

function object(value, fields, label) {
  if (
    !isRecord(value) ||
    Object.keys(value).some(key => !fields.includes(key)) ||
    fields.some(key => !(key in value))
  ) {
    throw new Error(`${label}: unexpected or missing fields`);
  }
  return value;
}

function strings(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label}: expected array`);
  values.forEach(value => requireString(value, label));
  if (new Set(values).size !== values.length)
    throw new Error(`${label}: duplicate value`);
  return values;
}

function path(value) {
  requireString(value, 'source path');
  if (
    !/^[A-Za-z0-9_.\/-]+$/u.test(value) ||
    value.startsWith('/') ||
    value.split('/').includes('..')
  ) {
    throw new Error('source path must be repository-relative');
  }
}

function endpoint(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'endpoint must be HTTPS without credentials, query or fragment'
    );
  }
  return url.href;
}

/** Compose existing registries. Valid structure is never operational readiness. */
export function composeCompanyRegistry(architecture, access, commissioning) {
  const registry = object(
    architecture.company,
    ['schema', 'coverage', 'objects'],
    'company'
  );
  if (registry.schema !== COMPANY_SCHEMA)
    throw new Error('unsupported company schema');
  if (!Array.isArray(registry.objects) || !Array.isArray(registry.coverage))
    throw new Error('company arrays required');
  const capabilities = new Set([
    ...access.capabilities.map(item => item.id),
    ...commissioning.capabilities.map(item => item.id),
  ]);
  const objects = new Map();
  for (const item of registry.objects) {
    object(
      item,
      [
        'id',
        'type',
        'owner',
        'purpose',
        'authority',
        'dependencies',
        'capabilities',
        'attributes',
      ],
      'company object'
    );
    if (!ID.test(requireString(item.id, 'stable ID')) || objects.has(item.id))
      throw new Error('invalid or duplicate stable ID');
    if (!TYPES.includes(item.type)) throw new Error('invalid object type');
    requireString(item.owner, 'owner');
    requireString(item.purpose, 'purpose');
    object(item.authority, ['repository', 'path'], 'authority');
    if (!REPOSITORY.test(item.authority.repository))
      throw new Error('source repository required');
    path(item.authority.path);
    strings(item.dependencies, 'dependencies');
    strings(item.capabilities, 'capabilities');
    if (item.capabilities.some(id => !capabilities.has(id)))
      throw new Error('unknown capability reference');
    object(item.attributes, ATTRIBUTES[item.type], 'attributes');
    Object.values(item.attributes).forEach(value =>
      requireString(value, 'attribute')
    );
    objects.set(item.id, item);
  }
  const requireType = (id, type) => {
    const item = objects.get(id);
    if (!item || item.type !== type)
      throw new Error(`missing ${type} reference: ${id}`);
    return item;
  };
  const productionServices = new Set();
  const productionEndpoints = new Set();
  const productionProjects = new Set();
  for (const item of objects.values()) {
    if (item.dependencies.some(id => !objects.has(id) || id === item.id))
      throw new Error('unknown or self dependency');
    const a = item.attributes;
    if (item.type === 'repository' && a.slug !== item.authority.repository)
      throw new Error('repository authority mismatch');
    if (item.type === 'service') {
      const repository = requireType(a.repositoryId, 'repository');
      if (repository.attributes.slug !== item.authority.repository)
        throw new Error('service repository mismatch');
      path(a.identityPath);
      if (a.identityPath !== item.authority.path)
        throw new Error('service identity authority mismatch');
    }
    if (item.type === 'work' || item.type === 'deployment')
      requireType(a.serviceId, 'service');
    if (item.type === 'work' && !/^(JOV|LYB)-[1-9][0-9]*$/u.test(a.issue))
      throw new Error('invalid work reference');
    if (item.type === 'deployment') {
      const service = requireType(a.serviceId, 'service');
      if (canonicalJson(service.authority) !== canonicalJson(item.authority))
        throw new Error('deployment authority mismatch');
      const url = endpoint(a.endpoint);
      if (
        !['production', 'staging', 'preview'].includes(a.environment) ||
        !['canonical', 'candidate', 'unassigned'].includes(a.role)
      )
        throw new Error('invalid deployment scope');
      if (a.environment === 'production' && a.role === 'canonical') {
        if (
          productionServices.has(a.serviceId) ||
          productionEndpoints.has(url) ||
          productionProjects.has(a.projectId)
        )
          throw new Error('conflicting production binding');
        productionServices.add(a.serviceId);
        productionEndpoints.add(url);
        productionProjects.add(a.projectId);
      }
    }
  }
  // A dependency cycle is not an independently reusable asset graph.
  const visited = new Set();
  const visit = (id, ancestors = new Set()) => {
    if (ancestors.has(id)) throw new Error('dependency cycle');
    if (visited.has(id)) return;
    const next = new Set([...ancestors, id]);
    objects.get(id).dependencies.forEach(dependency => visit(dependency, next));
    visited.add(id);
  };
  objects.forEach(item => visit(item.id));
  const coverage = new Map();
  for (const row of registry.coverage) {
    object(row, ['type', 'state', 'reason', 'sourceRefs'], 'coverage');
    if (!TYPES.includes(row.type) || coverage.has(row.type))
      throw new Error('invalid or duplicate coverage type');
    if (!['partial', 'unenumerated'].includes(row.state))
      throw new Error('coverage cannot assert company completeness');
    requireString(row.reason, 'coverage reason');
    if (strings(row.sourceRefs, 'coverage sources').length === 0)
      throw new Error('coverage source required');
    const count = [...objects.values()].filter(
      item => item.type === row.type
    ).length;
    if (row.state === 'unenumerated' && count !== 0)
      throw new Error('unenumerated coverage contains objects');
    coverage.set(row.type, {
      ...row,
      enumeratedCount: count,
      totalCount: null,
    });
  }
  if (coverage.size !== TYPES.length)
    throw new Error('missing coverage domain');
  for (const source of [access, commissioning]) {
    requireType(source.companyServiceId, 'service');
  }
  if (access.companyServiceId !== commissioning.companyServiceId)
    throw new Error('registry service mismatch');
  if (commissioning.certificationContract !== 'jovie.certification/v1')
    throw new Error('existing certification authority required');
  return {
    schema: COMPANY_SCHEMA,
    revision: createHash('sha256')
      .update(canonicalJson({ architecture, access, commissioning }))
      .digest('hex'),
    objects: structuredClone([...objects.values()]),
    coverage: [...coverage.values()],
    certificationContract: commissioning.certificationContract,
    certificationState: 'not-evaluated',
    complete: false,
  };
}

/**
 * Compare a separately retrieved observation against an independently supplied exact
 * artifact expectation. This checks binding/freshness only, NOT signature authority
 * or certification (owned by jovie.certification/v1).
 */
export function validateCompanyObservation(
  projection,
  expected,
  observation,
  nowMs
) {
  if (!Number.isFinite(nowMs))
    throw new Error('finite observation clock required');
  const fields = [
    'objectId',
    'projectionRevision',
    'repository',
    'sourceRevision',
    'artifactDigest',
    'deploymentId',
  ];
  object(expected, fields, 'expected artifact');
  object(
    observation,
    [...fields, 'observedAt', 'expiresAt', 'evidenceRef'],
    'observation'
  );
  const item = projection.objects.find(
    candidate => candidate.id === expected.objectId
  );
  if (!item || item.type !== 'deployment')
    throw new Error('deployment observation target required');
  if (
    expected.projectionRevision !== projection.revision ||
    expected.repository !== item.authority.repository
  )
    throw new Error('observation source authority mismatch');
  if (
    !SHA.test(expected.sourceRevision) ||
    !DIGEST.test(expected.artifactDigest)
  )
    throw new Error('exact artifact revision required');
  requireString(expected.deploymentId, 'deployment ID');
  requireString(observation.evidenceRef, 'evidence reference');
  if (fields.some(field => observation[field] !== expected[field]))
    throw new Error('mismatched artifact observation');
  const observed = Date.parse(
    requireIsoTimestamp(observation.observedAt, 'observedAt')
  );
  const expires = Date.parse(
    requireIsoTimestamp(observation.expiresAt, 'expiresAt')
  );
  if (
    observed > nowMs ||
    expires <= nowMs ||
    expires <= observed ||
    nowMs - observed > 15 * 60 * 1000 ||
    expires - observed > 15 * 60 * 1000
  )
    throw new Error('stale or future observation');
  return {
    status: 'bound-observation',
    certified: false,
    evidenceRef: observation.evidenceRef,
  };
}
