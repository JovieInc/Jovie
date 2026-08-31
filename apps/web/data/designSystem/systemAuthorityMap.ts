import rawAuthorityMap from './systemAuthorityMap.json';

export const DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA =
  'jovie.design-system-authority/v1' as const;

export const DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES = [
  'canonical-enforced',
  'canonical-unenforced',
  'partially-migrated',
  'duplicated',
  'missing',
  'obsolete-superseded',
] as const;

export type DesignSystemAuthorityStatus =
  (typeof DESIGN_SYSTEM_AUTHORITY_STATUS_VALUES)[number];

export const DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES = [
  'foundation',
  'primitive',
  'interaction',
  'composition',
  'archetype',
  'recipe',
  'surface',
  'certification',
  'legacy',
] as const;

export type DesignSystemAuthorityLayer =
  (typeof DESIGN_SYSTEM_AUTHORITY_LAYER_VALUES)[number];

export interface DesignSystemAuthorityOwner {
  readonly issue: `JOV-${number}`;
  readonly state: string;
  readonly role: string;
  readonly pr?: `#${number}`;
}

export interface DesignSystemAuthorityEntry {
  readonly id: string;
  readonly layer: DesignSystemAuthorityLayer;
  readonly status: DesignSystemAuthorityStatus;
  readonly statusFloor: DesignSystemAuthorityStatus;
  readonly classificationReason: string;
  readonly dependsOn: readonly string[];
  readonly owns: readonly string[];
  readonly canonicalSources: readonly string[];
  readonly executableChecks: readonly string[];
  readonly currentOwners: readonly DesignSystemAuthorityOwner[];
}

export interface DesignSystemAuthorityMap {
  readonly schema: typeof DESIGN_SYSTEM_AUTHORITY_MAP_SCHEMA;
  readonly statusValues: readonly DesignSystemAuthorityStatus[];
  readonly dependencyOrder: readonly string[];
  readonly entries: readonly DesignSystemAuthorityEntry[];
}

export const DESIGN_SYSTEM_AUTHORITY_MAP = Object.freeze(
  rawAuthorityMap
) as DesignSystemAuthorityMap;

export const DESIGN_SYSTEM_AUTHORITY_ENTRY_IDS = Object.freeze(
  DESIGN_SYSTEM_AUTHORITY_MAP.dependencyOrder
) as readonly string[];
