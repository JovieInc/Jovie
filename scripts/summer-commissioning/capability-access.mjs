import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSafeProbeId,
  isRecord,
  requireIsoTimestamp,
  requireString,
  requireStringArray,
  SAFE_GIT_SHA,
  SAFE_SHA256,
  validateRuntimeReceipt,
} from './receipt-trust.mjs';

export const ACCESS_REGISTRY_SCHEMA =
  'jovie.summer-capability-access-registry/v1';

export const REQUIRED_ACCESS_CAPABILITY_IDS = [
  'summer-access-gbrain',
  'summer-access-sentry',
  'summer-access-neon-postgres',
  'summer-access-stripe',
  'summer-access-github-linear',
  'summer-access-deployment-ci',
  'summer-access-ovie-escalation',
];

const PACKET_STATUSES = new Set(['existing', 'partial', 'missing']);
const EVIDENCE_TIERS = new Set([
  'source',
  'policy',
  'host',
  'runtime',
  'gap',
  'receipt',
]);

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be boolean`);
  }
  return value;
}

function validateAccessState(state, packet, field) {
  if (!isRecord(state)) throw new Error(`${field} must be an object`);
  const configured = requireBoolean(state.configured, `${field}.configured`);
  const authenticated = requireBoolean(
    state.authenticated,
    `${field}.authenticated`
  );
  const authorized = requireBoolean(state.authorized, `${field}.authorized`);
  const liveProbed = requireBoolean(state.liveProbed, `${field}.liveProbed`);
  const autonomousSafe = requireBoolean(
    state.autonomousSafe,
    `${field}.autonomousSafe`
  );

  if (authenticated && !configured) {
    throw new Error(`${field}.authenticated requires configured`);
  }
  if (liveProbed && !(configured && authenticated && authorized)) {
    throw new Error(
      `${field}.liveProbed requires configured, authenticated, and authorized`
    );
  }
  if (
    autonomousSafe &&
    (!(configured && authenticated && authorized && liveProbed) ||
      packet.status !== 'existing')
  ) {
    throw new Error(
      `${field}.autonomousSafe requires all prior gates and an existing least-privilege packet`
    );
  }
}

function validatePacket(packet, field) {
  if (!isRecord(packet)) throw new Error(`${field} must be an object`);
  if (!PACKET_STATUSES.has(packet.status)) {
    throw new Error(`${field}.status is invalid`);
  }
  requireString(packet.owner, `${field}.owner`);
  requireStringArray(packet.grants, `${field}.grants`);
  requireStringArray(packet.explicitDenials, `${field}.explicitDenials`);
  requireString(packet.reEvaluateWhen, `${field}.reEvaluateWhen`);
}

function validateProbe(probe, field) {
  if (!isRecord(probe)) throw new Error(`${field} must be an object`);
  assertSafeProbeId(probe.id, `${field}.id`);
  requireString(probe.version, `${field}.version`);
  requireString(probe.fixture, `${field}.fixture`);
  requireString(probe.expectedState, `${field}.expectedState`);
  if (probe.requiresSummerPrincipal !== true) {
    throw new Error(`${field}.requiresSummerPrincipal must be true`);
  }
  if (probe.forbidsHostSubstitution !== true) {
    throw new Error(`${field}.forbidsHostSubstitution must be true`);
  }
  if (probe.requiresAttestedReceipt !== true) {
    throw new Error(`${field}.requiresAttestedReceipt must be true`);
  }
}

export function validateAccessRegistry(registry) {
  if (!isRecord(registry)) throw new Error('access registry must be an object');
  if (registry.schema !== ACCESS_REGISTRY_SCHEMA) {
    throw new Error(`registry.schema must be ${ACCESS_REGISTRY_SCHEMA}`);
  }
  requireString(registry.auditVersion, 'registry.auditVersion');
  requireString(registry.issue, 'registry.issue');
  requireIsoTimestamp(registry.auditedAt, 'registry.auditedAt');
  if (!SAFE_GIT_SHA.test(registry.sourceVersion ?? '')) {
    throw new Error('registry.sourceVersion must be an exact git SHA');
  }
  if (!isRecord(registry.principal)) {
    throw new Error('registry.principal must be an object');
  }
  if (registry.principal.id !== 'summer') {
    throw new Error('registry.principal.id must be summer');
  }
  requireString(registry.principal.channel, 'registry.principal.channel');
  if (!SAFE_SHA256.test(registry.principal.safeToolManifestDigest ?? '')) {
    throw new Error(
      'registry.principal.safeToolManifestDigest must be a SHA-256 digest'
    );
  }
  if (!SAFE_SHA256.test(registry.principal.policyDigest ?? '')) {
    throw new Error('registry.principal.policyDigest must be a SHA-256 digest');
  }
  if (!Array.isArray(registry.capabilities)) {
    throw new Error('registry.capabilities must be an array');
  }

  const ids = new Set();
  const probeIds = new Set();
  for (const [index, capability] of registry.capabilities.entries()) {
    const field = `registry.capabilities[${index}]`;
    if (!isRecord(capability)) throw new Error(`${field} must be an object`);
    const id = requireString(capability.id, `${field}.id`);
    if (ids.has(id)) throw new Error(`duplicate access capability id ${id}`);
    ids.add(id);
    requireString(capability.capability, `${field}.capability`);
    requireString(capability.accessMode, `${field}.accessMode`);
    requireString(capability.dataBoundary, `${field}.dataBoundary`);
    if (capability.hostEvidenceCountsAsSummer !== false) {
      throw new Error(`${field}.hostEvidenceCountsAsSummer must be false`);
    }

    validatePacket(
      capability.leastPrivilegePacket,
      `${field}.leastPrivilegePacket`
    );
    validateAccessState(
      capability.state,
      capability.leastPrivilegePacket,
      `${field}.state`
    );
    validateProbe(capability.deterministicProbe, `${field}.deterministicProbe`);
    if (probeIds.has(capability.deterministicProbe.id)) {
      throw new Error(
        `duplicate access probe id ${capability.deterministicProbe.id}`
      );
    }
    probeIds.add(capability.deterministicProbe.id);

    if (
      !Array.isArray(capability.evidence) ||
      capability.evidence.length === 0
    ) {
      throw new Error(`${field}.evidence must be a non-empty array`);
    }
    for (const [evidenceIndex, evidence] of capability.evidence.entries()) {
      const evidenceField = `${field}.evidence[${evidenceIndex}]`;
      if (!isRecord(evidence)) {
        throw new Error(`${evidenceField} must be an object`);
      }
      if (!EVIDENCE_TIERS.has(evidence.tier)) {
        throw new Error(`${evidenceField}.tier is invalid`);
      }
      requireString(evidence.ref, `${evidenceField}.ref`);
      requireString(evidence.summary, `${evidenceField}.summary`);
      if (evidence.tier === 'host' && evidence.countsForSummer !== false) {
        throw new Error(`${evidenceField}.countsForSummer must be false`);
      }
    }

    if (!capability.state.autonomousSafe) {
      requireString(capability.blocker, `${field}.blocker`);
    } else if (capability.blocker !== null) {
      throw new Error(`${field}.blocker must be null when autonomousSafe`);
    }
  }

  const missing = REQUIRED_ACCESS_CAPABILITY_IDS.filter(id => !ids.has(id));
  const unexpected = [...ids].filter(
    id => !REQUIRED_ACCESS_CAPABILITY_IDS.includes(id)
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `registry.capabilities must contain the exact required IDs; missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`
    );
  }
  return registry;
}

export function validateAccessRuntimeReceipt(receipt, capability, context) {
  const errors = validateRuntimeReceipt(receipt, capability, context);
  if (!isRecord(receipt?.accessClaim)) {
    return [...errors, 'accessClaim must be an object'];
  }
  const claim = receipt.accessClaim;
  if (claim.principal !== 'summer') {
    errors.push('accessClaim.principal must be summer');
  }
  if (claim.safeToolManifestDigest !== context.safeToolManifestDigest) {
    errors.push('accessClaim.safeToolManifestDigest mismatch');
  }
  if (claim.policyDigest !== context.policyDigest) {
    errors.push('accessClaim.policyDigest mismatch');
  }
  for (const gate of [
    'configured',
    'authenticated',
    'authorized',
    'liveProbed',
    'autonomousSafe',
  ]) {
    if (claim[gate] !== true) errors.push(`accessClaim.${gate} must be true`);
  }
  if (claim.hostEvidenceUsed !== false) {
    errors.push('accessClaim.hostEvidenceUsed must be false');
  }
  if (capability.leastPrivilegePacket.status !== 'existing') {
    errors.push('least-privilege packet is not existing');
  }
  return errors;
}

function fileDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function validateAccessRegistryBindings(registry, repositoryRoot) {
  const expected = {
    safeToolManifestDigest: fileDigest(
      resolve(repositoryRoot, 'apps/web/lib/ovie/isolation.ts')
    ),
    policyDigest: fileDigest(
      resolve(
        repositoryRoot,
        'apps/eve-pilot/identities/summer/instructions.md'
      )
    ),
  };
  for (const [field, digest] of Object.entries(expected)) {
    if (registry.principal[field] !== digest) {
      throw new Error(`registry.principal.${field} is stale`);
    }
  }
  return registry;
}

export function loadAccessRegistry(path) {
  return validateAccessRegistry(JSON.parse(readFileSync(path, 'utf8')));
}

function main() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const registryPath =
    process.argv[2] ??
    fileURLToPath(
      new URL('./capability-access-registry.json', import.meta.url)
    );
  const registry = loadAccessRegistry(registryPath);
  validateAccessRegistryBindings(registry, resolve(moduleDirectory, '../..'));
  const safe = registry.capabilities.filter(
    capability => capability.state.autonomousSafe
  ).length;
  process.stdout.write(
    `${JSON.stringify({ schema: registry.schema, capabilities: registry.capabilities.length, autonomousSafe: safe, blocked: registry.capabilities.length - safe })}\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
