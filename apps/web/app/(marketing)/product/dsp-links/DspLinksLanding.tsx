import { DSP_LINKS_COPY } from '@/data/dspLinksCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';
import { DspLinksList } from './DspLinksList';

export function DspLinksLanding() {
  return (
    <ProductFeatureLanding
      slug='dsp-links'
      owner='apps/web/app/(marketing)/product/dsp-links/DspLinksLanding.tsx'
      copy={DSP_LINKS_COPY}
    >
      <DspLinksList />
    </ProductFeatureLanding>
  );
}
