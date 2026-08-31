import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export const AUTHORITY_MAP_PATH =
  'apps/web/data/designSystem/systemAuthorityMap.json';
export const AUTHORITY_MAP_SCHEMA = 'jovie.design-system-authority/v1';
export const AUTHORITY_MAP_STATUS_VALUES = Object.freeze([
  'canonical-enforced',
  'canonical-unenforced',
  'partially-migrated',
  'duplicated',
  'missing',
  'obsolete-superseded',
]);
const AUTHORITY_MAP_LAYER_VALUES = Object.freeze([
  'foundation',
  'primitive',
  'interaction',
  'composition',
  'archetype',
  'recipe',
  'surface',
  'certification',
  'legacy',
]);
const AUTHORITY_MAP_STATUS_RANK = new Map(
  [
    'missing',
    'duplicated',
    'partially-migrated',
    'canonical-unenforced',
    'canonical-enforced',
    'obsolete-superseded',
  ].map((status, index) => [status, index])
);
const AUTHORITY_MAP_LAYER_RANK = new Map(
  AUTHORITY_MAP_LAYER_VALUES.map((layer, index) => [layer, index])
);
const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const has = value => typeof value === 'string' && value.trim() !== '';
const add = (issues, code, detail) => issues.push({ code, detail });
const layerFromId = id =>
  AUTHORITY_MAP_LAYER_VALUES.find(layer => id.startsWith(`${layer}.`)) ?? null;

function safeRepoPath(value) {
  return (
    has(value) &&
    value.trim() === value &&
    !isAbsolute(value) &&
    !value.includes('\\') &&
    !value.split('/').includes('..')
  );
}

function exactStringArray(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item, index) => value[index] === item)
  );
}

function validatePathList(issues, entryId, paths, repoRoot) {
  if (!Array.isArray(paths)) {
    add(issues, 'invalid-authority-path-list', entryId);
    return;
  }
  for (const sourcePath of paths) {
    if (!safeRepoPath(sourcePath)) {
      add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
      continue;
    }
    if (repoRoot && !existsSync(resolve(repoRoot, sourcePath))) {
      add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
    }
  }
}

export function validateDesignSystemAuthorityMap(map, repoRoot = null) {
  const issues = [];
  if (!isObject(map)) {
    add(issues, 'invalid-authority-map', 'map must be an object');
    return issues;
  }
  if (map.schema !== AUTHORITY_MAP_SCHEMA) {
    add(issues, 'invalid-authority-schema', 'schema');
  }
  if (!exactStringArray(map.statusValues, AUTHORITY_MAP_STATUS_VALUES)) {
    add(issues, 'invalid-authority-status', 'statusValues');
  }
  if (!Array.isArray(map.dependencyOrder) || map.dependencyOrder.length === 0) {
    add(issues, 'missing-authority-entry', 'dependencyOrder');
    return issues;
  }
  if (!Array.isArray(map.entries) || map.entries.length === 0) {
    add(issues, 'missing-authority-entry', 'entries');
    return issues;
  }

  const ids = new Set();
  const orderedIds = new Set(map.dependencyOrder);
  const order = new Map(map.dependencyOrder.map((id, index) => [id, index]));
  if (orderedIds.size !== map.dependencyOrder.length) {
    add(issues, 'duplicate-authority-id', 'dependencyOrder');
  }

  let priorLayerRank = -1;
  for (const [index, entry] of map.entries.entries()) {
    if (!isObject(entry) || !has(entry.id)) {
      add(issues, 'missing-authority-entry', `entries[${index}]`);
      continue;
    }
    if (ids.has(entry.id)) add(issues, 'duplicate-authority-id', entry.id);
    ids.add(entry.id);
    if (map.dependencyOrder[index] !== entry.id || !orderedIds.has(entry.id)) {
      add(issues, 'missing-authority-entry', entry.id);
    }
    if (!AUTHORITY_MAP_LAYER_VALUES.includes(entry.layer)) {
      add(issues, 'invalid-authority-layer', entry.id);
    }
    const expectedLayer = layerFromId(entry.id);
    if (expectedLayer !== null && entry.layer !== expectedLayer) {
      add(issues, 'invalid-authority-layer', `${entry.id}:${entry.layer}`);
    }
    const entryLayerRank = AUTHORITY_MAP_LAYER_RANK.get(entry.layer);
    if (entryLayerRank !== undefined) {
      if (entryLayerRank < priorLayerRank) {
        add(issues, 'invalid-authority-layer', `${entry.id}:layer-order`);
      }
      priorLayerRank = Math.max(priorLayerRank, entryLayerRank);
    }
    if (!AUTHORITY_MAP_STATUS_VALUES.includes(entry.status)) {
      add(issues, 'invalid-authority-status', entry.id);
    }
    if (!AUTHORITY_MAP_STATUS_VALUES.includes(entry.statusFloor)) {
      add(issues, 'invalid-authority-status-floor', entry.id);
    } else if (
      (AUTHORITY_MAP_STATUS_RANK.get(entry.status) ?? -1) <
      (AUTHORITY_MAP_STATUS_RANK.get(entry.statusFloor) ?? -1)
    ) {
      add(issues, 'invalid-authority-status-floor', entry.id);
    }
    if (
      !Array.isArray(entry.owns) ||
      entry.owns.length === 0 ||
      entry.owns.some(item => !has(item))
    ) {
      add(issues, 'missing-owned-capability', entry.id);
    }
    if (!has(entry.classificationReason)) {
      add(issues, 'missing-classification-reason', entry.id);
    }
    if (
      entry.status !== 'missing' &&
      (!Array.isArray(entry.canonicalSources) ||
        entry.canonicalSources.length === 0)
    ) {
      add(issues, 'missing-authority-source', entry.id);
    }
    if (
      entry.status === 'canonical-enforced' &&
      (!Array.isArray(entry.executableChecks) ||
        entry.executableChecks.length === 0)
    ) {
      add(issues, 'missing-authority-check', entry.id);
    }
    if (
      !Array.isArray(entry.currentOwners) ||
      entry.currentOwners.length === 0
    ) {
      add(issues, 'missing-current-owner', entry.id);
    } else {
      for (const owner of entry.currentOwners) {
        if (
          !isObject(owner) ||
          !/^JOV-\d+$/.test(owner.issue ?? '') ||
          !has(owner.state) ||
          !has(owner.role) ||
          (owner.pr !== undefined && !/^#\d+$/.test(owner.pr))
        ) {
          add(
            issues,
            'invalid-current-owner',
            `${entry.id}:${owner?.issue ?? 'unknown'}`
          );
        }
      }
    }

    validatePathList(issues, entry.id, entry.canonicalSources ?? [], repoRoot);
    validatePathList(issues, entry.id, entry.executableChecks ?? [], repoRoot);

    const entryOrder = order.get(entry.id);
    if (!Array.isArray(entry.dependsOn)) {
      add(issues, 'invalid-authority-dependency', entry.id);
      continue;
    }
    for (const dependency of entry.dependsOn) {
      const dependencyOrder = order.get(dependency);
      if (dependencyOrder === undefined || dependency === entry.id) {
        add(
          issues,
          'invalid-authority-dependency',
          `${entry.id}:${dependency}`
        );
      } else if (entryOrder !== undefined && dependencyOrder >= entryOrder) {
        add(issues, 'invalid-dependency-order', `${entry.id}:${dependency}`);
      }
    }
  }

  for (const id of map.dependencyOrder) {
    if (!ids.has(id)) add(issues, 'missing-authority-entry', id);
  }

  return issues;
}

export function readDesignSystemAuthorityMap(repoRoot = process.cwd()) {
  return JSON.parse(
    readFileSync(resolve(repoRoot, AUTHORITY_MAP_PATH), 'utf8')
  );
}

export function loadAndValidateDesignSystemAuthorityMap(
  repoRoot = process.cwd()
) {
  return validateDesignSystemAuthorityMap(
    readDesignSystemAuthorityMap(repoRoot),
    repoRoot
  );
}

if (process.argv[1] === import.meta.filename) {
  const issues = loadAndValidateDesignSystemAuthorityMap();
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.code}: ${issue.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Design-system authority map passed.');
  }
}
