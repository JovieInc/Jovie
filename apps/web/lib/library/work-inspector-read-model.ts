import {
  type LibraryInspectorAssetRef,
  libraryInspectorSelectionForAsset,
  selectFindingsForLibraryInspector,
} from './inspector-scope';
import type { LibraryPostReleaseBundle } from './post-release-types';
import type { LibraryProfileItemKind } from './profile-visibility';

export type WorkPagePublication = 'live' | 'not_public' | 'unknown';
export type WorkDestinationState = 'connected' | 'disconnected' | 'unsupported';

export interface WorkInspectorPresentationSource {
  readonly id: string;
  readonly itemKind?: LibraryProfileItemKind;
  readonly status: string;
  readonly profileVisibility: 'visible' | 'hidden';
  readonly share?: { readonly visibility: 'public' | 'private' } | null;
  readonly providers: readonly { readonly label: string }[];
  readonly primaryActionLabel?: string;
}

export interface WorkInspectorPresentation {
  readonly objectId: string;
  readonly releaseLifecycle: string;
  readonly pagePublication: WorkPagePublication;
  readonly profileVisibility: 'visible' | 'hidden';
  readonly primaryVisitorAction: string;
  readonly destinationState: WorkDestinationState;
  readonly destinations: readonly string[];
}

const DESTINATION_CAPABLE_KINDS = new Set<LibraryProfileItemKind>([
  'release',
  'audio',
  'video',
]);

function defaultVisitorAction(kind: LibraryProfileItemKind): string {
  switch (kind) {
    case 'audio':
    case 'release':
      return 'Listen';
    case 'video':
      return 'Watch';
    case 'merch':
      return 'Shop';
    case 'document':
      return 'Read';
    case 'image':
      return 'View';
  }
}

/**
 * Keeps lifecycle, page publication, profile placement, visitor action, and
 * destination connectivity as independent presentation dimensions.
 */
export function deriveWorkInspectorPresentation(
  source: WorkInspectorPresentationSource
): WorkInspectorPresentation {
  const kind = source.itemKind ?? 'release';
  const destinations = source.providers.map(provider => provider.label);
  const destinationState = DESTINATION_CAPABLE_KINDS.has(kind)
    ? destinations.length > 0
      ? 'connected'
      : 'disconnected'
    : 'unsupported';

  return {
    objectId: source.id,
    releaseLifecycle: source.status,
    pagePublication:
      source.share?.visibility === 'public'
        ? 'live'
        : source.share?.visibility === 'private'
          ? 'not_public'
          : 'unknown',
    profileVisibility: source.profileVisibility,
    primaryVisitorAction:
      source.primaryActionLabel ?? defaultVisitorAction(kind),
    destinationState,
    destinations,
  };
}

interface WorkInspectorScopeRef extends LibraryInspectorAssetRef {
  readonly source?: {
    readonly canonicalId?: string | null;
    readonly provider?: string | null;
  } | null;
}

function releaseIdForWork(asset: WorkInspectorScopeRef): string | null {
  if (asset.linkedReleaseId) return asset.linkedReleaseId;
  if (asset.itemKind == null || asset.itemKind === 'release') return asset.id;
  return asset.source?.provider === 'discography'
    ? (asset.source.canonicalId ?? null)
    : null;
}

/**
 * Produces the immutable object-scoped slice consumed by the Work rail.
 * Provider stats remain excluded until they carry a subject id; profile-wide
 * connector state must never be presented as a selected-work measurement.
 */
export function scopeWorkInspectorBundle(
  asset: WorkInspectorScopeRef,
  bundle: LibraryPostReleaseBundle
): LibraryPostReleaseBundle {
  const selection = libraryInspectorSelectionForAsset(asset);
  const releaseId = releaseIdForWork(asset);

  return {
    downloads: releaseId
      ? bundle.downloads.filter(download => download.releaseId === releaseId)
      : [],
    findings: selectFindingsForLibraryInspector(bundle.findings, selection),
    rightsholders: bundle.rightsholders.filter(evidence =>
      selection.scopeIds.has(evidence.subjectId)
    ),
    stats: [],
  };
}
