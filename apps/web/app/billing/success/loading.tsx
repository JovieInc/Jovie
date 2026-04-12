import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

/**
 * Billing success page loading skeleton.
 * Matches: celebration icon → 3 feature cards → dashboard button.
 */
export default function BillingSuccessLoading() {
  return (
    <StandaloneProductPage width='lg' centered>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-56'
          descriptionWidth='w-80'
          className='min-h-0 px-4 py-3'
        />

        <div className='space-y-6 px-5 py-5 text-center sm:px-6'>
          {/* Celebration icon */}
          <div className='mx-auto h-16 w-16 rounded-full skeleton motion-reduce:animate-none' />

          {/* 3 feature cards */}
          <div className='grid gap-4 sm:grid-cols-3'>
            {Array.from({ length: 3 }, (_, i) => `feature-${i}`).map(key => (
              <ContentSurfaceCard
                key={key}
                surface='nested'
                className='space-y-2 p-4 text-left'
              >
                <div className='h-5 w-5 rounded skeleton motion-reduce:animate-none' />
                <LoadingSkeleton height='h-4' width='w-28' rounded='md' />
                <LoadingSkeleton height='h-3' width='w-full' rounded='md' />
              </ContentSurfaceCard>
            ))}
          </div>

          {/* Dashboard button */}
          <LoadingSkeleton
            height='h-10'
            width='w-44'
            rounded='md'
            className='mx-auto'
          />
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
