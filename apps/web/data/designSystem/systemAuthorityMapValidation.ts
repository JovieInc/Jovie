import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES,
  DESIGN_SYSTEM_AUTHORITY_MAP,
  DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA,
  DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES,
  type DesignSystemAuthorityMap,
  type DesignSystemAuthorityStatus,
} from './systemAuthorityMap';

export type DesignSystemAuthorityMapIssueCode =
  | 'duplicate-authority-id'
  | 'duplicate-owned-capability'
  | 'invalid-authority-check-path'
  | 'invalid-authority-dependency'
  | 'invalid-authority-layer'
  | 'invalid-authority-schema'
  | 'invalid-authority-status'
  | 'invalid-authority-status-floor'
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
const STATUS_FLOORS: Readonly<
  Partial<Record<string, DesignSystemAuthorityStatus>>
> = Object.freeze({
  'foundation.tokens': 'partially-migrated',
  'primitive.components': 'partially-migrated',
  'interaction.families': 'canonical-enforced',
  'composition.shared-owners': 'partially-migrated',
  'archetype.product-screens': 'canonical-enforced',
  'recipe.marketing-pages': 'canonical-enforced',
  'surface.product-routes': 'partially-migrated',
  'surface.marketing-routes': 'duplicated',
  'certification.changed-surfaces': 'partially-migrated',
  'legacy.historical-inventories': 'obsolete-superseded',
});
const LAYER_RANK = new Map(
  DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES.map(
    (layer, index) => [layer, index] as const
  )
);

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
const layerFromId = (id: string) =>
  DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES.find(layer =>
    id.startsWith(`${layer}.`)
  ) ?? null;
const capabilityKey = (value: string) => (has(value) ? value.trim() : null);
const CHECK_PATH_EXTENSIONS =
  /\.(?:cjs|cts|js|mjs|mts|sh|spec\.[cm]?[jt]sx?|test\.[cm]?[jt]sx?|ts|tsx|ya?ml)$/;
const TEST_PATH_PATTERN = /(?:^|\/)(?:__tests__|tests)\//;
const TEST_FILE_PATTERN = /(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/;

const isExecutableCheckPath = (value: string) =>
  CHECK_PATH_EXTENSIONS.test(value) &&
  (value.startsWith('scripts/') ||
    value.startsWith('.github/workflows/') ||
    TEST_PATH_PATTERN.test(value) ||
    TEST_FILE_PATTERN.test(value));

function validatePathList(
  issues: DesignSystemAuthorityMapIssue[],
  entryId: string,
  paths: readonly string[],
  repoRoot: string | null,
  options: { readonly executable?: boolean } = {}
) {
  for (const sourcePath of paths) {
    if (!isSafeRepoPath(sourcePath)) {
      add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
      continue;
    }
    if (repoRoot) {
      try {
        if (!statSync(resolve(repoRoot, sourcePath)).isFile()) {
          add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
          continue;
        }
      } catch {
        add(issues, 'invalid-repo-path', `${entryId}:${sourcePath}`);
        continue;
      }
    }
    if (options.executable && !isExecutableCheckPath(sourcePath)) {
      add(issues, 'invalid-authority-check-path', `${entryId}:${sourcePath}`);
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
  const capabilityOwners = new Map<string, string>();

  if (orderedIds.size !== map.dependencyOrder.length) {
    add(issues, 'duplicate-authority-id', 'dependencyOrder');
  }

  let priorLayerRank = -1;
  for (const [index, entry] of map.entries.entries()) {
    if (ids.has(entry.id)) add(issues, 'duplicate-authority-id', entry.id);
    ids.add(entry.id);

    if (map.dependencyOrder[index] !== entry.id || !orderedIds.has(entry.id)) {
      add(issues, 'missing-authority-entry', entry.id);
    }
    if (!DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES.includes(entry.layer)) {
      add(issues, 'invalid-authority-layer', entry.id);
    }
    const expectedLayer = layerFromId(entry.id);
    if (expectedLayer === null) {
      add(issues, 'invalid-authority-layer', `${entry.id}:id-prefix`);
    } else if (entry.layer !== expectedLayer) {
      add(issues, 'invalid-authority-layer', `${entry.id}:${entry.layer}`);
    }
    const entryLayerRank = LAYER_RANK.get(entry.layer);
    if (entryLayerRank !== undefined) {
      if (entryLayerRank < priorLayerRank) {
        add(issues, 'invalid-authority-layer', `${entry.id}:layer-order`);
      }
      priorLayerRank = Math.max(priorLayerRank, entryLayerRank);
    }
    if (!DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES.includes(entry.status)) {
      add(issues, 'invalid-authority-status', entry.id);
    }
    if (Object.hasOwn(entry as Record<string, unknown>, 'statusFloor')) {
      add(issues, 'invalid-authority-status-floor', `${entry.id}:mutable`);
    }
    const statusFloor = STATUS_FLOORS[entry.id];
    if (!statusFloor) {
      add(issues, 'invalid-authority-status-floor', entry.id);
    } else if (statusFloor !== entry.status) {
      add(issues, 'invalid-authority-status-floor', entry.id);
    }
    if (!entry.owns.length) {
      add(issues, 'missing-owned-capability', entry.id);
    } else {
      const entryCapabilities = new Set<string>();
      for (const capability of entry.owns) {
        const key = capabilityKey(capability);
        if (!key) {
          add(issues, 'missing-owned-capability', entry.id);
          continue;
        }
        if (key !== capability) {
          add(issues, 'missing-owned-capability', `${entry.id}:${capability}`);
        }
        const priorOwner = entryCapabilities.has(key)
          ? entry.id
          : capabilityOwners.get(key);
        if (priorOwner) {
          add(
            issues,
            'duplicate-owned-capability',
            `${entry.id}:${key}:${priorOwner}`
          );
        } else {
          capabilityOwners.set(key, entry.id);
        }
        entryCapabilities.add(key);
      }
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
    validatePathList(issues, entry.id, entry.executableChecks, repoRoot, {
      executable: true,
    });

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
  for (const id of Object.keys(STATUS_FLOORS)) {
    if (!ids.has(id)) add(issues, 'missing-authority-entry', id);
  }

  return issues;
}
