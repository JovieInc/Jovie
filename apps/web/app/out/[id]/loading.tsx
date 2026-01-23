/**
 * Interstitial page loading skeleton
 * Matches the confirmation card layout
 */
export default function InterstitialLoading() {
  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center px-4'>
      <div className='max-w-md w-full bg-white rounded-lg shadow-lg p-6'>
        <div className='text-center'>
          {/* Icon skeleton */}
          <div className='mb-6'>
            <div className='mx-auto w-16 h-16 skeleton rounded-full' />
          </div>

          {/* Title skeleton */}
          <div className='mx-auto h-7 w-56 skeleton rounded-md mb-3' />

          {/* Description skeleton */}
          <div className='mx-auto h-5 w-72 skeleton rounded-md mb-6' />

          {/* Button skeleton */}
          <div className='h-10 w-full skeleton rounded-md mb-4' />

          {/* Footer text skeleton */}
          <div className='mx-auto h-4 w-64 skeleton rounded-md' />
        </div>
      </div>
    </div>
  );
}
