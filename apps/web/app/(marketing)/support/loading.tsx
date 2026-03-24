import { MarketingContainer } from '@/components/marketing';

export default function SupportLoading() {
  return (
    <div className='pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32'>
      <MarketingContainer width='page'>
        {/* Hero skeleton */}
        <div className='flex flex-col items-start'>
          <div className='h-4 w-16 skeleton rounded' />
          <div className='mt-6 h-12 w-64 skeleton rounded-lg' />
          <div className='mt-6 h-5 w-80 skeleton rounded' />
        </div>

        {/* Channels grid skeleton */}
        <div className='mx-auto mt-16 max-w-[720px] px-6 sm:px-8 lg:px-10'>
          <div className='h-7 w-48 skeleton rounded' />
          <div className='mt-6 grid gap-8 sm:grid-cols-3'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div className='h-5 w-28 skeleton rounded' />
                <div className='mt-2 h-4 w-full skeleton rounded' />
                <div className='mt-3 h-4 w-16 skeleton rounded' />
              </div>
            ))}
          </div>
        </div>

        {/* FAQ skeleton */}
        <div className='mx-auto mt-16 max-w-[720px] px-6 sm:px-8 lg:px-10'>
          <div className='h-7 w-64 skeleton rounded' />
          <div className='mt-8 space-y-5'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='h-5 w-full skeleton rounded' />
            ))}
          </div>
        </div>

        {/* Bottom CTA skeleton */}
        <div className='mx-auto mt-16 max-w-[720px] px-6 sm:px-8 lg:px-10'>
          <div className='h-7 w-40 skeleton rounded' />
          <div className='mt-4 h-5 w-72 skeleton rounded' />
          <div className='mt-6 h-10 w-40 skeleton rounded-lg' />
        </div>
      </MarketingContainer>
    </div>
  );
}
