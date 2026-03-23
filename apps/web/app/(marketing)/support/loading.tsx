import { MarketingContainer } from '@/components/marketing';

/**
 * Support page loading skeleton
 */
export default function SupportLoading() {
  return (
    <div className='pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32'>
      <MarketingContainer width='page'>
        <div className='flex flex-col items-center text-center'>
          {/* Title skeleton */}
          <div className='h-12 w-64 skeleton rounded-lg mb-6' />
          {/* Button skeleton */}
          <div className='h-10 w-40 skeleton rounded-lg' />
        </div>
      </MarketingContainer>
    </div>
  );
}
