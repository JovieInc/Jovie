import { MarketingContainer } from '@/components/marketing';

export default function ChangelogLoading() {
  return (
    <section
      className='min-h-screen'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        color: 'var(--linear-text-primary)',
      }}
    >
      {/* Hero skeleton */}
      <div className='pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32 text-center'>
        <MarketingContainer width='page'>
          <div className='mx-auto h-12 w-56 skeleton rounded-lg' />
          <div className='mx-auto mt-4 h-5 w-96 max-w-full skeleton rounded-lg' />
          <div className='mx-auto mt-4 h-5 w-32 skeleton rounded-lg' />
        </MarketingContainer>
      </div>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='max-w-3xl space-y-10'>
          {Array.from({ length: 4 }, (_, i) => `cl-skeleton-${i}`).map(key => (
            <div
              key={key}
              className='pl-6 border-l-2 border-white/10 space-y-3'
            >
              <div className='flex gap-2'>
                <div className='h-5 w-16 skeleton rounded-full' />
                <div className='h-5 w-24 skeleton rounded' />
              </div>
              <div className='space-y-2'>
                <div className='h-4 w-full skeleton rounded' />
                <div className='h-4 w-5/6 skeleton rounded' />
                <div className='h-4 w-3/4 skeleton rounded' />
              </div>
            </div>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
