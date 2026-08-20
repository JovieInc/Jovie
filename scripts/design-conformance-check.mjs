#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectDesignConformanceChecks } from './design-conformance-paths.mjs';

export const MANIFEST_PATH =
  'docs/design-system/design-conformance-manifest.json';
export const LOCK_PROFILE_PATH = 'scripts/agent/pen-workspace-locks.json';
export const COMPONENT_REGISTRY_PATH =
  'apps/web/data/designSystem/componentRegistry.ts';

const SCHEMA = 'jovie.design-conformance/v1';
const PROFILE = 'jovie-founder-design-studio';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PEN_ROOT_PATTERN = /^[A-Za-z0-9_-]+$/;
const ALLOWED_STATES = Object.freeze([
  'candidate',
  'deprecated',
  'draft',
  'founder-locked',
  'source-bound',
]);
const FOUNDER_LOCK_REQUIREMENTS = Object.freeze([
  'canonical-pen-sha256',
  'saved-state-verified-receipt',
  'source-digest',
  'unique-pen-root',
]);
const LEGACY_UNBOUND_CEILING = new Set([
  'atom.brand-logo',
  'atom.link',
  'atom.logo',
  'atom.logo-link',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortedUniqueStrings(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => typeof item === 'string' && item.trim() !== '') &&
    new Set(value).size === value.length &&
    [...value].sort().every((item, index) => item === value[index])
  );
}

function exactStringArray(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item, index) => value[index] === item)
  );
}

function safeRepoPath(value) {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value !== '' &&
    !isAbsolute(value) &&
    !value.split('/').includes('..') &&
    !value.includes('\\')
  );
}

function trackedFiles(repoRoot) {
  return new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
  );
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

function registryEntries(source) {
  const start = source.indexOf(
    'export const DESIGN_SYSTEM_COMPONENT_REGISTRY = ['
  );
  const end = source.indexOf('] as const satisfies', start);
  if (start === -1 || end === -1) return [];
  const registrySource = source.slice(start, end);
  const entries = [];
  const blockPattern = /^  \{\n\s+id:\s+'([^']+)',([\s\S]*?)^  \},$/gm;
  for (const match of registrySource.matchAll(blockPattern)) {
    const body = match[2];
    const penRootExpression =
      body.match(/\n\s+penRootId:\s+([^,\n]+),/)?.[1]?.trim() ?? null;
    const familyMapExpression =
      body.match(/\n\s+penRootByVariantKey:\s+([^,\n]+),/)?.[1]?.trim() ?? null;
    entries.push({
      id: match[1],
      source: body.match(/\n\s+source:\s+'([^']+)'/)?.[1] ?? null,
      referenceEligible:
        body.match(/\n\s+referenceEligible:\s+(true|false)/)?.[1] === 'true',
      hasPenRoot:
        (penRootExpression !== null && penRootExpression !== 'null') ||
        (familyMapExpression !== null && familyMapExpression !== 'null'),
    });
  }
  return entries;
}

function declaredRegistryIds(source) {
  const match = source.match(
    /export const DESIGN_SYSTEM_COMPONENT_IDS\s*=\s*\[([\s\S]*?)\]\s*as const;/
  );
  if (!match) return [];
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]);
}

function sourceDigestPaths(component) {
  return [
    component.source,
    component.contractSource,
    ...(component.tokenSources ?? []),
  ].sort();
}

export function computeComponentSourceDigest(repoRoot, component) {
  const digest = createHash('sha256');
  for (const relativePath of sourceDigestPaths(component)) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(readFileSync(resolve(repoRoot, relativePath)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

export function validateDesignConformance({
  repoRoot,
  manifest,
  lockProfiles,
  componentRegistrySource,
  tracked = trackedFiles(repoRoot),
}) {
  const issues = [];
  const add = (code, detail) => issues.push({ code, detail });

  if (!isObject(manifest) || manifest.schema !== SCHEMA) {
    add('invalid-schema', `schema must equal ${SCHEMA}`);
    return issues;
  }

  const authority = manifest.authority;
  const profile = lockProfiles?.profiles?.[PROFILE];
  if (!isObject(authority) || authority.profile !== PROFILE) {
    add('invalid-authority-profile', `authority.profile must equal ${PROFILE}`);
  }
  if (!profile || authority?.canonicalPath !== profile.canonical_path) {
    add(
      'canonical-path-mismatch',
      'manifest canonicalPath must equal the repository Pen lock profile'
    );
  }
  if (authority?.ciReadsLivePen !== false) {
    add('live-pen-read-forbidden', 'CI must not read the live Pen workspace');
  }
  if (authority?.penWritesAllowed !== false) {
    add('pen-write-forbidden', 'this gate must never authorize Pen writes');
  }

  const verifiedExport = authority?.verifiedExport;
  if (!isObject(verifiedExport)) {
    add('missing-export-boundary', 'authority.verifiedExport is required');
  } else if (verifiedExport.status === 'verified') {
    if (!SHA256_PATTERN.test(verifiedExport.penSha256 ?? '')) {
      add('invalid-pen-sha256', 'verified export requires a lowercase SHA-256');
    }
    if (verifiedExport.receiptVerdict !== 'saved_state_verified') {
      add(
        'invalid-save-receipt',
        'verified export requires saved_state_verified'
      );
    }
  } else if (verifiedExport.status === 'unavailable') {
    if (
      verifiedExport.penSha256 !== null ||
      verifiedExport.receiptVerdict !== null ||
      typeof verifiedExport.reason !== 'string' ||
      verifiedExport.reason.trim() === ''
    ) {
      add(
        'invalid-unavailable-export',
        'unavailable export requires null evidence and an explicit reason'
      );
    }
  } else {
    add(
      'invalid-export-status',
      'export status must be unavailable or verified'
    );
  }

  const allowedStates = manifest.policy?.allowedStates;
  if (!exactStringArray(allowedStates, ALLOWED_STATES)) {
    add(
      'invalid-state-policy',
      'allowedStates must match the v1 state contract'
    );
  }
  if (manifest.policy?.legacyMode !== 'shrink-only') {
    add('invalid-legacy-mode', 'legacyMode must remain shrink-only');
  }
  if (
    !exactStringArray(
      manifest.policy?.founderLockedRequires,
      FOUNDER_LOCK_REQUIREMENTS
    )
  ) {
    add(
      'invalid-founder-lock-policy',
      'founderLockedRequires must match the v1 evidence contract'
    );
  }

  const components = manifest.components;
  if (!Array.isArray(components) || components.length === 0) {
    add(
      'missing-components',
      'at least one source-bound component is required'
    );
  }
  const componentIds = new Set();
  const penRoots = new Set();
  for (const component of Array.isArray(components) ? components : []) {
    if (!isObject(component) || typeof component.id !== 'string') {
      add('invalid-component', 'every component requires an id');
      continue;
    }
    if (componentIds.has(component.id)) {
      add('duplicate-component-id', component.id);
    }
    componentIds.add(component.id);
    if (!allowedStates?.includes(component.state)) {
      add('invalid-component-state', component.id);
    }
    if (
      component.state === 'founder-locked' &&
      verifiedExport?.status !== 'verified'
    ) {
      add('unverified-founder-lock', component.id);
    }
    if (!Number.isInteger(component.revision) || component.revision < 1) {
      add('invalid-component-revision', component.id);
    }
    if (!PEN_ROOT_PATTERN.test(component.penRootId ?? '')) {
      add('invalid-pen-root', component.id);
    } else if (penRoots.has(component.penRootId)) {
      add('duplicate-pen-root', component.penRootId);
    } else {
      penRoots.add(component.penRootId);
    }
    for (const key of [
      'platforms',
      'tokenSources',
      'storySources',
      'testSources',
    ]) {
      if (!sortedUniqueStrings(component[key])) {
        add('invalid-component-array', `${component.id}:${key}`);
      }
    }
    const evidencePaths = [
      component.source,
      component.contractSource,
      ...(component.tokenSources ?? []),
      ...(component.storySources ?? []),
      ...(component.testSources ?? []),
    ];
    for (const relativePath of evidencePaths) {
      if (
        !safeRepoPath(relativePath) ||
        !tracked.has(relativePath) ||
        !existsSync(resolve(repoRoot, relativePath))
      ) {
        add('missing-source-evidence', `${component.id}:${relativePath}`);
      }
    }
    if (!SHA256_PATTERN.test(component.sourceDigest ?? '')) {
      add('invalid-source-digest', component.id);
    } else if (
      sourceDigestPaths(component).every(
        relativePath =>
          safeRepoPath(relativePath) &&
          tracked.has(relativePath) &&
          existsSync(resolve(repoRoot, relativePath))
      )
    ) {
      try {
        const actual = computeComponentSourceDigest(repoRoot, component);
        if (actual !== component.sourceDigest) {
          add('source-digest-drift', component.id);
        }
      } catch (error) {
        add('source-digest-unreadable', `${component.id}:${error.message}`);
      }
    }
    if (
      safeRepoPath(component.contractSource) &&
      tracked.has(component.contractSource) &&
      existsSync(resolve(repoRoot, component.contractSource))
    ) {
      const contractSource = readFileSync(
        resolve(repoRoot, component.contractSource),
        'utf8'
      );
      const contractRoots = [
        ...contractSource.matchAll(/\brootId:\s*'([^']+)'/g),
      ].map(item => item[1]);
      if (!contractRoots.includes(component.penRootId)) {
        add('contract-pen-root-mismatch', component.id);
      }
    }
  }

  const legacy = manifest.legacy?.unboundComponentIds;
  if (!Array.isArray(legacy) || !sortedUniqueStrings(legacy)) {
    add('invalid-legacy-list', 'legacy unbound IDs must be sorted and unique');
  }
  const legacyIds = new Set(Array.isArray(legacy) ? legacy : []);
  for (const id of legacyIds) {
    if (!LEGACY_UNBOUND_CEILING.has(id)) {
      add('legacy-debt-increase', id);
    }
    if (componentIds.has(id)) add('bound-and-legacy', id);
  }

  const registry = registryEntries(componentRegistrySource);
  const declaredIds = declaredRegistryIds(componentRegistrySource);
  if (registry.length === 0) {
    add('registry-unreadable', COMPONENT_REGISTRY_PATH);
  }
  if (declaredIds.length === 0) {
    add('registry-id-contract-unreadable', COMPONENT_REGISTRY_PATH);
  }
  const registryIds = new Set(registry.map(entry => entry.id));
  const declaredIdSet = new Set(declaredIds);
  if (
    declaredIdSet.size !== declaredIds.length ||
    registryIds.size !== registry.length ||
    declaredIdSet.size !== registryIds.size ||
    [...declaredIdSet].some(id => !registryIds.has(id))
  ) {
    add(
      'registry-id-contract-mismatch',
      'declared component IDs must map one-to-one to registry entries'
    );
  }
  for (const id of new Set([...registryIds, ...declaredIdSet])) {
    if (!componentIds.has(id) && !legacyIds.has(id)) {
      add('untracked-registry-component', id);
    }
  }
  for (const id of [...componentIds, ...legacyIds]) {
    if (!registryIds.has(id)) add('stale-manifest-component', id);
  }
  for (const component of Array.isArray(components) ? components : []) {
    const entry = registry.find(candidate => candidate.id === component.id);
    if (!entry) continue;
    if (entry.source !== component.source) {
      add('registry-source-mismatch', component.id);
    }
    if (!entry.referenceEligible || !entry.hasPenRoot) {
      add('registry-pen-binding-missing', component.id);
    }
  }

  return issues;
}

export function loadAndValidate(repoRoot = process.cwd()) {
  const manifest = readJson(repoRoot, MANIFEST_PATH);
  const lockProfiles = readJson(repoRoot, LOCK_PROFILE_PATH);
  const componentRegistrySource = readFileSync(
    resolve(repoRoot, COMPONENT_REGISTRY_PATH),
    'utf8'
  );
  return validateDesignConformance({
    repoRoot,
    manifest,
    lockProfiles,
    componentRegistrySource,
  });
}

function changedFiles(repoRoot) {
  const explicit = process.env.DESIGN_CONFORMANCE_CHANGED_FILES;
  if (explicit) {
    const parsed = JSON.parse(explicit);
    if (!Array.isArray(parsed)) {
      throw new Error('DESIGN_CONFORMANCE_CHANGED_FILES must be a JSON array');
    }
    return parsed;
  }

  const base =
    process.env.TURBO_SCM_BASE ||
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main');
  return execFileSync(
    'git',
    ['diff', '--diff-filter=ACDMRT', '--name-only', `${base}...HEAD`],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function main() {
  const repoRoot = process.cwd();
  let selection;
  try {
    selection = selectDesignConformanceChecks(changedFiles(repoRoot));
  } catch (error) {
    console.error(`Design conformance failed closed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (selection.invalidPaths.length > 0) {
    console.error(
      `Design conformance failed closed: invalid changed paths: ${selection.invalidPaths.join(', ')}`
    );
    process.exitCode = 1;
    return;
  }

  let issues;
  try {
    issues = loadAndValidate(repoRoot);
  } catch (error) {
    console.error(`Design conformance failed closed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.code}: ${issue.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Design conformance passed (${selection.applicable ? selection.domains.join(', ') : 'manifest-only'}); live Pen read=false; Pen write=false; Ubuntu ops affected=${selection.ubuntuOperationsAffected}.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
