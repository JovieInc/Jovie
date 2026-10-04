import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
import {
  type LogoPermission,
  type LogoPlacement,
  permittedLogoAssetIds,
} from '@/data/product-truth/logo-permissions';
import type { HomepageLabelPartner } from './home-surface-seed';

interface HomepageLabelLogoMarkProps {
  readonly partner: HomepageLabelPartner;
  readonly className?: string;
  /** Where the mark renders; it renders only with an active permission. */
  readonly placement: LogoPlacement;
  /** Stories and tests only; the logo-permission gate rejects it elsewhere. */
  readonly fixturePermissions?: readonly LogoPermission[];
}

export function HomepageLabelLogoMark({
  partner,
  className,
  placement,
  fixturePermissions,
}: Readonly<HomepageLabelLogoMarkProps>) {
  if (
    !permittedLogoAssetIds(placement, {
      permissions: fixturePermissions,
    }).includes(partner)
  ) {
    return null;
  }
  return <NormalizedTrustLogo id={partner} className={className} />;
}
