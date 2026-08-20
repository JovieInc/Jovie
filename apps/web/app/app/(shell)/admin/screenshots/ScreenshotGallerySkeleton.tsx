import { Skeleton } from '@jovie/ui';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `ss-skel-${i}`);

export function ScreenshotGallerySkeleton() {
  return (
    <div
      className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      data-testid='admin-screenshots-skeleton'
      aria-hidden='true'
    >
      {SKELETON_KEYS.map(key => (
        <ContentSurfaceCard
          key={key}
          className='space-y-3 p-3.5'
          data-testid='admin-screenshots-skeleton-card'
        >
          <Skeleton className='aspect-video w-full' rounded='lg' />
          <Skeleton className='h-4 w-3/4' />
          <Skeleton className='h-8 w-24' rounded='md' />
        </ContentSurfaceCard>
      ))}
    </div>
  );
}
