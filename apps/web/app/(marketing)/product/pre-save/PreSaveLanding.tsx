import { PRE_SAVE_COPY } from '@/data/preSaveCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';
import { PreSaveCountdown } from './PreSaveCountdown';

export function PreSaveLanding() {
  return (
    <ProductFeatureLanding
      slug='pre-save'
      owner='apps/web/app/(marketing)/product/pre-save/PreSaveLanding.tsx'
      copy={PRE_SAVE_COPY}
    >
      <PreSaveCountdown />
    </ProductFeatureLanding>
  );
}
