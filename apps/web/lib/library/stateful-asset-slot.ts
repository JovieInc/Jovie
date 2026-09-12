export const LIBRARY_INSPECTOR_ASSET_KINDS = [
  'audio',
  'artwork',
  'video',
  'docs',
  'stems',
] as const;

export type LibraryInspectorAssetKind =
  (typeof LIBRARY_INSPECTOR_ASSET_KINDS)[number];

export type AssetSlotOccupancy = 'empty' | 'populated';
export type AssetSlotCardinality = 'single' | 'multi';
export type AssetSlotAcquireMode = 'file' | 'action';

export interface StatefulAssetSlotPresentation {
  readonly mode: 'acquisition' | 'object';
  readonly showAcquisitionDropZone: boolean;
  readonly replaceAction: 'secondary' | 'hidden';
  readonly addAction: 'secondary' | 'hidden';
}

export interface ResolveStatefulAssetSlotInput {
  readonly occupancy: AssetSlotOccupancy;
  readonly cardinality: AssetSlotCardinality;
  readonly acquireMode: AssetSlotAcquireMode;
}

/** Empty → acquisition. Populated → object. Never show a drop zone when populated. */
export function resolveStatefulAssetSlot(
  input: ResolveStatefulAssetSlotInput
): StatefulAssetSlotPresentation {
  if (input.occupancy === 'populated') {
    return {
      mode: 'object',
      showAcquisitionDropZone: false,
      replaceAction: input.cardinality === 'single' ? 'secondary' : 'hidden',
      addAction: input.cardinality === 'multi' ? 'secondary' : 'hidden',
    };
  }

  return {
    mode: 'acquisition',
    showAcquisitionDropZone: input.acquireMode === 'file',
    replaceAction: 'hidden',
    addAction: 'hidden',
  };
}

export interface LibraryInspectorAssetProjection {
  readonly kind: LibraryInspectorAssetKind;
  readonly occupancy: AssetSlotOccupancy;
  readonly cardinality: AssetSlotCardinality;
  readonly acquireMode: AssetSlotAcquireMode;
  readonly objectTitle: string;
  readonly objectSubtitle: string;
}

export interface LibraryInspectorAssetSource {
  readonly itemKind?: string | null;
  readonly title: string;
  readonly previewUrl?: string | null;
  readonly artworkUrl?: string | null;
  readonly videoUrl?: string | null;
  readonly hasVideoLinks?: boolean;
  readonly source?: { readonly provider: string } | null;
  readonly documentStage?: string | null;
}

function slot(
  kind: LibraryInspectorAssetKind,
  occupancy: AssetSlotOccupancy,
  cardinality: AssetSlotCardinality,
  acquireMode: AssetSlotAcquireMode,
  objectTitle: string,
  objectSubtitle: string
): LibraryInspectorAssetProjection {
  return {
    kind,
    occupancy,
    cardinality,
    acquireMode,
    objectTitle,
    objectSubtitle,
  };
}

export function projectLibraryInspectorAssetSlot(
  kind: LibraryInspectorAssetKind,
  asset: LibraryInspectorAssetSource,
  stemCount = 0
): LibraryInspectorAssetProjection {
  const isRelease = (asset.itemKind ?? 'release') === 'release';
  const occupied = (value: unknown) => (value ? 'populated' : 'empty');

  switch (kind) {
    case 'audio':
      return slot(
        kind,
        occupied(asset.previewUrl),
        'single',
        'file',
        'Audio attached',
        'Preview, scrub, and trim a promo snippet for drops.'
      );
    case 'artwork':
      return slot(
        kind,
        occupied(asset.artworkUrl),
        'single',
        isRelease ? 'file' : 'action',
        asset.artworkUrl ? 'Artwork attached' : 'Artwork',
        'Cover art for this object.'
      );
    case 'video':
      return slot(
        kind,
        occupied(
          asset.videoUrl ||
            asset.hasVideoLinks ||
            asset.source?.provider === 'youtube'
        ),
        'single',
        'action',
        asset.title,
        asset.source?.provider === 'youtube'
          ? 'YouTube video'
          : 'Video attached'
      );
    case 'docs':
      return slot(
        kind,
        occupied(asset.itemKind === 'document'),
        'single',
        'action',
        asset.title,
        asset.documentStage
          ? asset.documentStage.replaceAll('_', ' ')
          : 'Document'
      );
    case 'stems':
      return slot(
        kind,
        occupied(stemCount > 0),
        'multi',
        'action',
        stemCount === 1 ? '1 stem file' : `${stemCount} stem files`,
        'Downloads, stems, and DJ promos.'
      );
  }
}
