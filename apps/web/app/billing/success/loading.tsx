import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

/**
 * Billing success page loading skeleton.
 * Matches: status icon → headline → 3 unlock tiles → CTA row.
 */
export default function BillingSuccessLoading() {
  return (
    <StandaloneProductPage width='lg' centered>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <div className='space-y-6 px-5 py-8 text-center sm:px-8 sm:py-10'>
          <div className='mx-auto h-14 w-14 rounded-full skeleton motion-reduce:animate-none' />

          <div className='space-y-2'>
            <LoadingSkeleton height='h-9' width='w-72' className='mx-auto' />
            <LoadingSkeleton height='h-4' width='w-80' className='mx-auto' />
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            {Array.from({ length: 3 }, (_, i) => `feature-${i}`).map(key => (
              <ContentSurfaceCard
                key={key}
                surface='nested'
                className='space-y-3 rounded-[14px] bg-surface-0 p-4 text-left'
              >
                <div className='h-9 w-9 rounded-full skeleton motion-reduce:animate-none' />
                <LoadingSkeleton height='h-3' width='w-16' rounded='md' />
                <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
              </ContentSurfaceCard>
            ))}
          </div>

          <div className='flex flex-col items-center justify-center gap-3 sm:flex-row'>
            <LoadingSkeleton height='h-10' width='w-40' rounded='md' />
            <LoadingSkeleton height='h-10' width='w-40' rounded='md' />
          </div>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
