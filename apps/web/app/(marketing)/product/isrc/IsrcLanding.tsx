import { ISRC_COPY } from '@/data/isrcCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';
import { IsrcEditor } from './IsrcEditor';

export function IsrcLanding() {
  return (
    <ProductFeatureLanding
      slug='isrc'
      owner='apps/web/app/(marketing)/product/isrc/IsrcLanding.tsx'
      copy={ISRC_COPY}
    >
      <IsrcEditor />
    </ProductFeatureLanding>
  );
}
