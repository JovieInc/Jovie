import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES,
  DESIGN_SYSTEM_AUTHORITY_MAP,
  DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA,
  DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES,
  type DesignSystemAuthorityMap,
} from './systemAuthorityMap';

export type DesignSystemAuthorityMapIssueCode =
  | 'duplicate-authority-id'
  | 'invalid-authority-dependency'
  | 'invalid-authority-layer'
  | 'invalid-authority-schema'
  | 'invalid-authority-status'
  | 'invalid-current-owner'
  | 'invalid-dependency-order'
  | 'invalid-repo-path'
  | 'missing-authority-check'
  | 'missing-authority-entry'
  | 'missing-authority-source'
  | 'missing-classification-reason'
  | 'missing-current-owner'
  | 'missing-owned-capability';

export interface DesignSystemAuthorityMapIssue {
  readonly code: DesignSystemAuthorityMapIssueCode;
  readonly id: string;
}

const has = (value?: string | null): value is string => Boolean(value?.trim());

const isSafeRepoPath = (value: string) =>
  has(value) &&
  value.trim() === value &&
  !isAbsolute(value) &&
  !value.includes('\\') &&
  !value.split('/').includes('..');

const add = (
  issues: DesignSystemAuthorityMapIssue[],
  code: DesignSystemAuthorityMapIssueCode,
  id: string
) => issues.push({ code, id });

function validatePathList(
  issues: DesignSystemAuthorityMapIssue[],
  entryId: string,
  paths: readonly string[],
  repoRoot: string | null
) {
  for (const sourcePath of paths) {
    if (!isSafeRepoPath(sourcePath)) {
      add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
      continue;
    }
    if (repoRoot && !existsSync(resolve(repoRoot, sourcePath))) {
      add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
    }
  }
}

export function validateDesignSystemAuthorityMap({
  map = DESIGN_SYSTEM_AUTHORITY_MAP,
  repoRoot = null,
}: {
  readonly map?: DesignSystemAuthorityMap;
  readonly repoRoot?: string | null;
} = {}): readonly DesignSystemAuthorityMapIssue[] {
  const issues: DesignSystemAuthorityMapIssue[] = [];

  if (map.schema !== DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA) {
    add(issues, 'invalid-authority-schema', 'schema');
  }

  if (
    map.statusValues.length !== DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES.length ||
    !DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES.every(
      (status, index) => map.statusValues[index] === status
    )
  ) {
    add(issues, 'invalid-authority-status', 'statusValues');
  }

  const ids = new Set<string>();
  const orderedIds = new Set(map.dependencyOrder);
  const order = new Map(
    map.dependencyOrder.map((id, index) => [id, index] as const)
  );

  if (orderedIds.size !== map.dependencyOrder.length) {
    add(issues, 'duplicate-authority-id', 'dependencyOrder');
  }

  for (const [index, entry] of map.entries.entries()) {
    if (ids.has(entry.id)) add(issues, 'duplicate-authority-id', entry.id);
    ids.add(entry.id);

    if (map.dependencyOrder[index] !== entry.id || !orderedIds.has(entry.id)) {
      add(issues, 'missing-authority-entry', entry.id);
    }
    if (!DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES.includes(entry.layer)) {
      add(issues, 'invalid-authority-layer', entry.id);
    }
    if (!DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES.includes(entry.status)) {
      add(issues, 'invalid-authority-status', entry.id);
    }
    if (!entry.owns.length || entry.owns.some(capability => !has(capability))) {
      add(issues, 'missing-owned-capability', entry.id);
    }
    if (!has(entry.classificationReason)) {
      add(issues, 'missing-classification-reason', entry.id);
    }
    if (entry.status !== 'missing' && !entry.canonicalSources.length) {
      add(issues, 'missing-authority-source', entry.id);
    }
    if (
      entry.status === 'canonical-enforced' &&
      !entry.executableChecks.length
    ) {
      add(issues, 'missing-authority-check', entry.id);
    }
    if (!entry.currentOwners.length) {
      add(issues, 'missing-current-owner', entry.id);
    }

    for (const owner of entry.currentOwners) {
      if (
        !/^JOV-\d+$/.test(owner.issue) ||
        !has(owner.state) ||
        !has(owner.role) ||
        (owner.pr !== undefined && !/^#\d+$/.test(owner.pr))
      ) {
        add(issues, 'invalid-current-owner', `${entry.id}:${owner.issue}`);
      }
    }

    validatePathList(issues, entry.id, entry.canonicalSources, repoRoot);
    validatePathList(issues, entry.id, entry.executableChecks, repoRoot);

    const entryOrder = order.get(entry.id);
    for (const dependency of entry.dependsOn) {
      const dependencyOrder = order.get(dependency);
      if (dependencyOrder === undefined || dependency === entry.id) {
        add(
          issues,
          'invalid-authority-dependency',
          `${entry.id}:${dependency}`
        );
        continue;
      }
      if (entryOrder !== undefined && dependencyOrder >= entryOrder) {
        add(issues, 'invalid-dependency-order', `${entry.id}:${dependency}`);
      }
    }
  }

  for (const id of map.dependencyOrder) {
    if (!ids.has(id)) add(issues, 'missing-authority-entry', id);
  }

  return issues;
}
