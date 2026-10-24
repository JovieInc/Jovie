import { UTM_LINKS_COPY } from '@/data/utmLinksCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';
import { UtmLinksBuilder } from './UtmLinksBuilder';

export function UtmLinksLanding() {
  return (
    <ProductFeatureLanding
      slug='utm-links'
      owner='apps/web/app/(marketing)/product/utm-links/UtmLinksLanding.tsx'
      copy={UTM_LINKS_COPY}
    >
      <UtmLinksBuilder />
    </ProductFeatureLanding>
  );
}
