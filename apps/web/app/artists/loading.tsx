import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

const SKELETON_KEYS = Array.from(
  { length: 8 },
  (_, i) => 'artist-skeleton-' + (i + 1)
);

export default function ArtistsLoading() {
  return (
    <StandaloneProductPage width='xl'>
      <div className='space-y-6'>
        <ContentSurfaceCard surface='details' className='overflow-hidden'>
          <ContentSectionHeaderSkeleton
            titleWidth='w-36'
            descriptionWidth='w-64'
          />
          <div className='grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0'>
            {Array.from({ length: 3 }, (_, i) => 'summary-' + i).map(key => (
              <ContentSurfaceCard
                key={key}
                surface='nested'
                className='space-y-2 p-4'
              >
                <LoadingSkeleton height='h-8' width='w-16' />
                <LoadingSkeleton height='h-3' width='w-24' />
                <LoadingSkeleton height='h-4' width='w-full' />
              </ContentSurfaceCard>
            ))}
          </div>
        </ContentSurfaceCard>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {SKELETON_KEYS.map(key => (
            <ContentSurfaceCard key={key} surface='nested' className='p-5'>
              <div className='flex flex-col items-center gap-3 text-center'>
                <LoadingSkeleton height='h-24' width='w-24' rounded='full' />
                <div className='space-y-2'>
                  <LoadingSkeleton
                    className='mx-auto'
                    height='h-5'
                    width='w-32'
                  />
                  <LoadingSkeleton
                    className='mx-auto'
                    lines={2}
                    height='h-4'
                    width='w-full'
                  />
                </div>
                <LoadingSkeleton
                  className='mx-auto'
                  height='h-4'
                  width='w-20'
                />
              </div>
            </ContentSurfaceCard>
          ))}
        </div>
      </div>
    </StandaloneProductPage>
  );
}
