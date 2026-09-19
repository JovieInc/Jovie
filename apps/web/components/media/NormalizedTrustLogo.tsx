import { NormalizedLogoAsset } from './NormalizedLogoAsset';
import { getTrustLogoAsset, type TrustLogoAssetId } from './trustLogoAssets';

interface NormalizedTrustLogoProps {
  readonly id: TrustLogoAssetId;
  readonly className?: string;
}

export function NormalizedTrustLogo({
  id,
  className,
}: Readonly<NormalizedTrustLogoProps>) {
  const asset = getTrustLogoAsset(id);
  const Logo = asset.component;
  return (
    <NormalizedLogoAsset
      asset={asset.normalization}
      fit='contain'
      className={className}
    >
      <Logo aria-label={asset.label} />
    </NormalizedLogoAsset>
  );
}
