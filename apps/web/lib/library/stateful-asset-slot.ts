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

export function assertPopulatedSlotHidesDropZone(
  presentation: StatefulAssetSlotPresentation
): void {
  if (presentation.mode === 'object' && presentation.showAcquisitionDropZone) {
    throw new Error(
      'Populated asset slots must not render an empty acquisition drop zone'
    );
  }
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

export function projectLibraryInspectorAssetSlot(
  kind: LibraryInspectorAssetKind,
  asset: LibraryInspectorAssetSource,
  stemCount = 0
): LibraryInspectorAssetProjection {
  const isRelease = (asset.itemKind ?? 'release') === 'release';

  switch (kind) {
    case 'audio':
      return {
        kind,
        occupancy: asset.previewUrl ? 'populated' : 'empty',
        cardinality: 'single',
        acquireMode: 'file',
        objectTitle: 'Audio attached',
        objectSubtitle: 'Preview, scrub, and trim a promo snippet for drops.',
      };
    case 'artwork':
      return {
        kind,
        occupancy: asset.artworkUrl ? 'populated' : 'empty',
        cardinality: 'single',
        acquireMode: isRelease ? 'file' : 'action',
        objectTitle: asset.artworkUrl ? 'Artwork attached' : 'Artwork',
        objectSubtitle: 'Cover art for this object.',
      };
    case 'video':
      return {
        kind,
        occupancy:
          asset.videoUrl ||
          asset.hasVideoLinks ||
          asset.source?.provider === 'youtube'
            ? 'populated'
            : 'empty',
        cardinality: 'single',
        acquireMode: 'action',
        objectTitle: asset.title,
        objectSubtitle:
          asset.source?.provider === 'youtube'
            ? 'YouTube video'
            : 'Video attached',
      };
    case 'docs':
      return {
        kind,
        occupancy: asset.itemKind === 'document' ? 'populated' : 'empty',
        cardinality: 'single',
        acquireMode: 'action',
        objectTitle: asset.title,
        objectSubtitle: asset.documentStage
          ? asset.documentStage.replaceAll('_', ' ')
          : 'Document',
      };
    case 'stems':
      return {
        kind,
        occupancy: stemCount > 0 ? 'populated' : 'empty',
        cardinality: 'multi',
        acquireMode: 'action',
        objectTitle:
          stemCount === 1 ? '1 stem file' : `${stemCount} stem files`,
        objectSubtitle: 'Downloads, stems, and DJ promos.',
      };
  }
}

export function projectLibraryInspectorAssetSlots(
  asset: LibraryInspectorAssetSource,
  stemCount = 0
): readonly LibraryInspectorAssetProjection[] {
  return LIBRARY_INSPECTOR_ASSET_KINDS.map(kind =>
    projectLibraryInspectorAssetSlot(kind, asset, stemCount)
  );
}
