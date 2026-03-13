import { BraggingRightsStrip } from '@/components/admin/BraggingRightsStrip';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getAdminBraggingRights } from '@/lib/admin/bragging-rights';

const BRAGGING_BADGE_CARD_SKELETON_KEYS = ['labels', 'distributors'];
const BRAGGING_BADGE_SKELETON_KEYS = ['badge-1', 'badge-2', 'badge-3'];
const BRAGGING_STAT_SKELETON_KEYS = ['visitors', 'clicks', 'contacts'];

export async function AdminBraggingRightsSection() {
  const data = await getAdminBraggingRights();

  return (
    <ContentSurfaceCard
      id='bragging-rights'
      className='overflow-hidden p-0'
      data-testid='admin-bragging-rights-section'
    >
      <ContentSectionHeader
        title='Platform Reach'
        subtitle='Labels, distributors, and ecosystem adoption signals'
        className='min-h-0 px-5 py-3'
      />
      <div className='px-5 py-4 pt-3'>
        <BraggingRightsStrip data={data} />
      </div>
    </ContentSurfaceCard>
  );
}

export function AdminBraggingRightsSectionSkeleton() {
  return (
    <ContentSurfaceCard id='bragging-rights' className='overflow-hidden p-0'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-28'
        descriptionWidth='w-56'
        className='min-h-0 px-5 py-3'
      />
      <div className='space-y-4 px-5 py-4 pt-3' aria-hidden='true'>
        <div className='grid gap-4 sm:grid-cols-2'>
          {BRAGGING_BADGE_CARD_SKELETON_KEYS.map(key => (
            <ContentSurfaceCard
              key={key}
              className='space-y-2 p-4'
              aria-hidden='true'
            >
              <div className='h-3 w-20 rounded skeleton' />
              <div className='flex flex-wrap gap-2'>
                {BRAGGING_BADGE_SKELETON_KEYS.map(badgeKey => (
                  <div
                    key={`${key}-${badgeKey}`}
                    className='h-6 w-16 rounded skeleton'
                  />
                ))}
              </div>
            </ContentSurfaceCard>
          ))}
        </div>
        <div className='grid gap-4 sm:grid-cols-3'>
          {BRAGGING_STAT_SKELETON_KEYS.map(key => (
            <ContentMetricCardSkeleton key={key} />
          ))}
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
