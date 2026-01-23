/**
 * Investors page loading skeleton
 */
export default function InvestorsLoading() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0D0E12]'>
      <section className='relative flex min-h-[80vh] flex-col items-center justify-center px-4 py-20 text-center'>
        {/* Title skeleton */}
        <div className='h-12 w-72 skeleton rounded-lg mb-4' />
        {/* Subtitle skeleton */}
        <div className='h-6 w-96 max-w-full skeleton rounded-md mb-8' />
        {/* Content skeleton */}
        <div className='max-w-3xl w-full space-y-4'>
          <div className='h-4 w-full skeleton rounded-md' />
          <div className='h-4 w-5/6 skeleton rounded-md' />
          <div className='h-4 w-4/5 skeleton rounded-md' />
        </div>
      </section>
    </div>
  );
}
