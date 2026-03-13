import { BraggingRightsStrip } from '@/components/admin/BraggingRightsStrip';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getAdminBraggingRights } from '@/lib/admin/bragging-rights';

const BRAGGING_BADGE_CARD_SKELETON_KEYS = ['labels', 'distributors'];
const BRAGGING_BADGE_SKELETON_KEYS = ['badge-1', 'badge-2', 'badge-3'];
const BRAGGING_STAT_SKELETON_KEYS = ['visitors', 'clicks', 'contacts'];

export async function AdminBraggingRightsSection() {
  const data = await getAdminBraggingRights();

  return (
    <section
      id='bragging-rights'
      className='space-y-2'
      data-testid='admin-bragging-rights-section'
    >
      <h2 className='text-2xs font-medium tracking-wide text-tertiary-token'>
        Platform Reach
      </h2>
      <BraggingRightsStrip data={data} />
    </section>
  );
}

export function AdminBraggingRightsSectionSkeleton() {
  return (
    <section id='bragging-rights' className='space-y-2'>
      <div className='h-4 w-28 rounded skeleton' />
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
    </section>
  );
}
