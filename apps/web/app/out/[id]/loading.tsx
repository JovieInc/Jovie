import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

export default function InterstitialLoading() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-48'
          descriptionWidth='w-64'
        />
        <div className='space-y-5 px-5 py-5 sm:px-6'>
          <LoadingSkeleton
            className='mx-auto'
            height='h-14'
            width='w-14'
            rounded='full'
          />
          <ContentSurfaceCard surface='nested' className='space-y-2 p-4'>
            <LoadingSkeleton height='h-3' width='w-24' />
            <LoadingSkeleton height='h-4' width='w-full' />
            <LoadingSkeleton height='h-3' width='w-40' />
          </ContentSurfaceCard>
          <LoadingSkeleton height='h-10' width='w-full' rounded='full' />
          <LoadingSkeleton className='mx-auto' height='h-3' width='w-56' />
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
