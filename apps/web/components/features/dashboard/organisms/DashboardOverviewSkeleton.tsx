import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const metricSkeletonKeys = ['reach', 'engagement', 'revenue'];
const taskSkeletonKeys = ['handle', 'music', 'social'];

export function DashboardOverviewSkeleton() {
  return (
    <div
      className='space-y-4'
      data-testid='dashboard-overview-skeleton'
      aria-busy='true'
      aria-live='polite'
    >
      <ContentSurfaceCard as='header' className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-44'
          descriptionWidth='w-52'
          actionWidths={['w-8', 'w-8', 'w-36']}
        />
      </ContentSurfaceCard>

      <ContentSurfaceCard as='section' className='p-4 sm:p-5'>
        <div className='grid gap-3 md:grid-cols-3'>
          {metricSkeletonKeys.map(key => (
            <div key={`metric-${key}`} className='space-y-2'>
              <LoadingSkeleton height='h-4' width='w-24' />
              <LoadingSkeleton height='h-8' width='w-32' />
              <LoadingSkeleton height='h-4' width='w-20' />
            </div>
          ))}
        </div>
      </ContentSurfaceCard>

      <ContentSurfaceCard as='section' className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-40'
          descriptionWidth='w-28'
        />
        <div className='space-y-3 p-4 sm:p-5'>
          <div className='grid gap-2 md:grid-cols-3'>
            {taskSkeletonKeys.map(key => (
              <LoadingSkeleton
                key={`task-${key}`}
                height='h-16'
                width='w-full'
              />
            ))}
          </div>
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
