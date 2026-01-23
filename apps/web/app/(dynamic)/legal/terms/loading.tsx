/**
 * Terms of service page loading skeleton
 */
export default function TermsLoading() {
  return (
    <div className='prose prose-neutral dark:prose-invert max-w-none'>
      {/* Title skeleton */}
      <div className='h-10 w-56 skeleton rounded-lg mb-4' />
      {/* Last updated skeleton */}
      <div className='h-4 w-48 skeleton rounded-md mb-8' />

      {/* Content skeleton */}
      <div className='space-y-6'>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={`terms-section-${i + 1}`} className='space-y-2'>
            <div className='h-6 w-48 skeleton rounded-md mb-3' />
            <div className='h-4 w-full skeleton rounded-md' />
            <div className='h-4 w-11/12 skeleton rounded-md' />
            <div className='h-4 w-4/5 skeleton rounded-md' />
          </div>
        ))}
      </div>
    </div>
  );
}
