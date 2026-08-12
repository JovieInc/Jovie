import type { ElementType } from 'react';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from '@/components/features/home/label-logos';
import { getLogoAssetNormalization } from '@/data/design/logoAssets';

export const TRUST_LOGO_ASSETS = [
  { id: 'awal', label: 'AWAL', component: AwalLogo },
  { id: 'orchard', label: 'The Orchard', component: TheOrchardLogo },
  {
    id: 'umg',
    label: 'Universal Music Group',
    component: UniversalMusicGroupLogo,
  },
  { id: 'armada', label: 'Armada Music', component: ArmadaMusicLogo },
  {
    id: 'black-hole-recordings',
    label: 'Black Hole Recordings',
    component: BlackHoleRecordingsLogo,
  },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly component: ElementType;
}[];

export type TrustLogoAssetId = (typeof TRUST_LOGO_ASSETS)[number]['id'];

export function getTrustLogoAsset(id: TrustLogoAssetId) {
  const identity = TRUST_LOGO_ASSETS.find(asset => asset.id === id);
  if (!identity) throw new Error(`Unknown trust logo asset: ${id}`);
  return { ...identity, normalization: getLogoAssetNormalization(id) };
}
