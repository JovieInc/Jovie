import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

/**
 * Billing success page loading skeleton.
 * Matches: status pill → 3 feature cards → dashboard button.
 */
export default function BillingSuccessLoading() {
  return (
    <StandaloneProductPage width='lg'>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-56'
          descriptionWidth='w-80'
          className='min-h-0 px-4 py-3'
        />

        <div className='space-y-6 px-5 py-5 text-center sm:px-6'>
          {/* Payment confirmed pill */}
          <div className='mx-auto h-6 w-36 rounded-full skeleton motion-reduce:animate-none' />

          {/* 3 feature cards */}
          <div className='grid gap-4 sm:grid-cols-3'>
            {Array.from({ length: 3 }, (_, i) => `feature-${i}`).map(key => (
              <ContentSurfaceCard key={key} surface='nested'>
                <div className='space-y-2 p-4 text-left'>
                  <div className='h-5 w-5 rounded skeleton motion-reduce:animate-none' />
                  <LoadingSkeleton height='h-4' width='w-28' rounded='md' />
                  <LoadingSkeleton height='h-3' width='w-full' rounded='md' />
                </div>
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
