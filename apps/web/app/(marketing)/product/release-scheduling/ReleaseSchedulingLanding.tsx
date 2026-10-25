import { ReleaseScheduleFields } from '@/components/features/release/ReleaseScheduleFields';
import { RELEASE_SCHEDULING_COPY } from '@/data/releaseSchedulingCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';

export function ReleaseSchedulingLanding() {
  return (
    <ProductFeatureLanding
      slug='release-scheduling'
      owner='apps/web/app/(marketing)/product/release-scheduling/ReleaseSchedulingLanding.tsx'
      copy={RELEASE_SCHEDULING_COPY}
    >
      <ReleaseScheduleFields />
    </ProductFeatureLanding>
  );
}
