// @coverage-via apps/web/tests/unit/home/homepage-anatomy-contract.test.tsx
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import {
  type LogoPlacement,
  permittedLogoAssetIds,
} from '@/data/product-truth/logo-permissions';

export const HOMEPAGE_LOGO_PLACEMENT: LogoPlacement = {
  page: '/',
  audience: 'general',
};

/**
 * Homepage logo strip (Pen Trust logos NLLgg). Renders only logos with an
 * active permission covering `/` (data/product-truth/logo-permissions.ts).
 * With none, it renders nothing: no placeholder and no unpermissioned marks.
 */
export function HomepageLogoStrip() {
  if (permittedLogoAssetIds(HOMEPAGE_LOGO_PLACEMENT).length === 0) return null;

  return (
    <div data-homepage-testid='homepage-logo-strip'>
      <HomeTrustSection
        placement={HOMEPAGE_LOGO_PLACEMENT}
        presentation='inline-strip'
        sectionVariant='homepage-identity'
        ariaLabel='Companies that work with Jovie'
      />
    </div>
  );
}
