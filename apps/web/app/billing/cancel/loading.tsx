import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

/**
 * Billing cancel page loading skeleton.
 * Matches: warning icon → message → two buttons.
 */
export default function BillingCancelLoading() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-44'
          descriptionWidth='w-80'
          className='min-h-0 px-4 py-3'
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          {/* Warning icon */}
          <div className='mx-auto h-14 w-14 rounded-full skeleton motion-reduce:animate-none' />

          {/* Message */}
          <LoadingSkeleton
            height='h-4'
            width='w-72'
            rounded='md'
            className='mx-auto'
          />

          {/* Buttons */}
          <div className='flex flex-col gap-2 sm:flex-row'>
            <LoadingSkeleton
              height='h-10'
              width='w-full'
              rounded='md'
              className='flex-1'
            />
            <LoadingSkeleton
              height='h-10'
              width='w-full'
              rounded='md'
              className='flex-1'
            />
          </div>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
