// @coverage-via apps/web/components/homepage/shell-hero/HomepageShellHero.test.tsx
import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
import { TRUST_LOGO_ASSETS } from '@/components/media/trustLogoAssets';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import {
  type LogoPermission,
  permittedLogoAssetIds,
} from '@/data/product-truth/logo-permissions';

/**
 * The hero's logo slot. It shows a logo only when LOGO_PERMISSIONS holds an
 * active grant covering `/`; with none (today) it renders nothing, not an
 * empty frame. `fixturePermissions` is for stories and tests only.
 */
export function HomepageLogoRow({
  fixturePermissions,
}: Readonly<{ fixturePermissions?: readonly LogoPermission[] }>) {
  const permitted = permittedLogoAssetIds(
    { page: '/' },
    { permissions: fixturePermissions }
  );
  const assets = TRUST_LOGO_ASSETS.filter(asset =>
    permitted.includes(asset.id)
  );
  if (assets.length === 0) return null;

  return (
    <ul
      aria-label={HOMEPAGE_COPY.shell.logoRowLabel}
      className='shell-hero__logo-row'
    >
      {assets.map(asset => (
        <li key={asset.id} className='shell-hero__logo'>
          <NormalizedTrustLogo id={asset.id} className='max-w-43' />
        </li>
      ))}
    </ul>
  );
}
