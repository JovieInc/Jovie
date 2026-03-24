import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

export default function ErrorPageLoading() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-40'
          descriptionWidth='w-64'
        />
        <div className='space-y-5 px-5 py-5 sm:px-6'>
          <LoadingSkeleton
            className='mx-auto'
            height='h-12'
            width='w-12'
            rounded='full'
          />
          <LoadingSkeleton lines={2} height='h-4' width='w-full' />
          <div className='flex flex-col gap-2 sm:flex-row'>
            <LoadingSkeleton height='h-10' width='w-full' rounded='full' />
            <LoadingSkeleton height='h-10' width='w-full' rounded='full' />
          </div>
          <LoadingSkeleton className='mx-auto' height='h-3' width='w-40' />
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
