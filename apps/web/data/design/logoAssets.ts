import type { LogoAssetNormalization } from '@jovie/ui/media/logo-normalization';
import rawRegistry from './logo-assets.json';

export interface JovieLogoAssetNormalization extends LogoAssetNormalization {
  readonly sourcePath: string;
  readonly provenance: LogoAssetNormalization['provenance'] & {
    readonly owner: string;
  };
}

export const LOGO_ASSET_REGISTRY = Object.freeze(
  rawRegistry.assets
) as readonly JovieLogoAssetNormalization[];

export function getLogoAssetNormalization(
  id: string
): JovieLogoAssetNormalization {
  const asset = LOGO_ASSET_REGISTRY.find(candidate => candidate.id === id);
  if (!asset) throw new Error(`Unknown normalized logo asset: ${id}`);
  return asset;
}
