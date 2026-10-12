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
