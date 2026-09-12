/**
 * Inspector scope integrity (JOV-6170 / JOV-6177).
 *
 * A Library detail rail belongs to the selected object. Artist/account
 * Presence recommendations stay on Presence surfaces unless a higher-level
 * problem is a tiny contextual blocker for that same object.
 */

export const INSPECTOR_SCOPE_TYPES = [
  'account',
  'artist',
  'release',
  'track',
  'asset',
  'link',
  'platform',
] as const;

export type InspectorScopeType = (typeof INSPECTOR_SCOPE_TYPES)[number];

export const INSPECTOR_SCOPE_CATEGORIES = [
  'presence',
  'rights',
  'metadata',
  'asset',
  'connection',
] as const;

export type InspectorScopeCategory =
  (typeof INSPECTOR_SCOPE_CATEGORIES)[number];

export const INSPECTOR_PRIMITIVES = [
  'state',
  'finding',
  'recommendation',
  'blocker',
] as const;

export type InspectorPrimitive = (typeof INSPECTOR_PRIMITIVES)[number];

export const LIBRARY_OBJECT_INSPECTOR_KINDS = ['release', 'track'] as const;

export type LibraryInspectorKind =
  | (typeof LIBRARY_OBJECT_INSPECTOR_KINDS)[number]
  | 'asset';

export interface InspectorSelection {
  readonly kind: LibraryInspectorKind;
  readonly scopeIds: ReadonlySet<string>;
}

export interface ScopedInspectorItem {
  readonly scopeType: InspectorScopeType;
  readonly scopeId: string;
  readonly category: InspectorScopeCategory;
  readonly primitive: InspectorPrimitive;
  readonly blocksSelectedObject?: boolean;
  readonly status?: 'open' | 'drafted' | 'resolved' | 'dismissed';
}

export interface LibraryInspectorAssetRef {
  readonly id: string;
  readonly itemKind?: string | null;
  readonly linkedReleaseId?: string | null;
  readonly source?: { readonly canonicalId?: string | null } | null;
}

const ARTIST_OR_ACCOUNT_SCOPES = new Set<InspectorScopeType>([
  'account',
  'artist',
]);

export const PRESENCE_ISSUE_TYPES = [
  'dead_link',
  'missing_jovie_link',
  'wrong_artist',
  'wrong_song',
  'wrong_identifier',
  'placement_opportunity',
] as const;

export function mapSubjectTypeToScopeType(
  subjectType: 'artist' | 'release' | 'recording' | 'track'
): InspectorScopeType {
  if (subjectType === 'artist') return 'artist';
  if (subjectType === 'release') return 'release';
  return 'track';
}

export function mapIssueTypeToCategory(
  issueType: string
): InspectorScopeCategory {
  if (issueType === 'connection_required') return 'connection';
  return 'presence';
}

export function mapFindingKindToPrimitive(
  kind: 'repair' | 'collision' | 'placement_opportunity'
): InspectorPrimitive {
  return kind === 'collision' ? 'finding' : 'recommendation';
}

export function deriveInspectorScope(input: {
  readonly subjectType: 'artist' | 'release' | 'recording' | 'track';
  readonly subjectId: string;
  readonly issueType: string;
  readonly kind: 'repair' | 'collision' | 'placement_opportunity';
  readonly scopeType?: InspectorScopeType;
  readonly scopeId?: string;
  readonly category?: InspectorScopeCategory;
  readonly primitive?: InspectorPrimitive;
  readonly blocksSelectedObject?: boolean;
}): Pick<
  ScopedInspectorItem,
  'scopeType' | 'scopeId' | 'category' | 'primitive' | 'blocksSelectedObject'
> {
  return {
    scopeType: input.scopeType ?? mapSubjectTypeToScopeType(input.subjectType),
    scopeId: input.scopeId ?? input.subjectId,
    category: input.category ?? mapIssueTypeToCategory(input.issueType),
    primitive: input.primitive ?? mapFindingKindToPrimitive(input.kind),
    blocksSelectedObject: input.blocksSelectedObject === true,
  };
}

export function isArtistOrAccountScope(scopeType: InspectorScopeType): boolean {
  return ARTIST_OR_ACCOUNT_SCOPES.has(scopeType);
}

export function isLibraryObjectInspector(
  kind: LibraryInspectorKind
): kind is (typeof LIBRARY_OBJECT_INSPECTOR_KINDS)[number] {
  return LIBRARY_OBJECT_INSPECTOR_KINDS.some(value => value === kind);
}

/**
 * Hard invariant: artist-scoped recommendations never render in a
 * track/release Library inspector. The only exception is a contextual
 * blocker that directly blocks the selected object.
 */
export function canRenderScopedItemInLibraryInspector(
  item: ScopedInspectorItem,
  inspector: InspectorSelection
): boolean {
  if (item.status === 'resolved' || item.status === 'dismissed') {
    return false;
  }

  if (isArtistOrAccountScope(item.scopeType)) {
    return (
      isLibraryObjectInspector(inspector.kind) &&
      item.primitive === 'blocker' &&
      item.blocksSelectedObject === true
    );
  }

  return inspector.scopeIds.has(item.scopeId);
}

export function libraryInspectorSelectionForAsset(
  asset: LibraryInspectorAssetRef
): InspectorSelection {
  const scopeIds = new Set<string>([asset.id]);
  if (asset.source?.canonicalId) scopeIds.add(asset.source.canonicalId);
  if (asset.linkedReleaseId) scopeIds.add(asset.linkedReleaseId);

  const kind: LibraryInspectorKind =
    asset.itemKind === 'audio' ||
    (asset.itemKind != null &&
      asset.itemKind !== 'release' &&
      Boolean(asset.linkedReleaseId))
      ? 'track'
      : asset.itemKind == null || asset.itemKind === 'release'
        ? 'release'
        : 'asset';

  return { kind, scopeIds };
}

export function selectFindingsForLibraryInspector<
  T extends ScopedInspectorItem,
>(findings: readonly T[], inspector: InspectorSelection): T[] {
  return findings.filter(finding =>
    canRenderScopedItemInLibraryInspector(finding, inspector)
  );
}

export function selectFindingsForLibraryAsset<T extends ScopedInspectorItem>(
  findings: readonly T[],
  asset: LibraryInspectorAssetRef
): T[] {
  return selectFindingsForLibraryInspector(
    findings,
    libraryInspectorSelectionForAsset(asset)
  );
}
