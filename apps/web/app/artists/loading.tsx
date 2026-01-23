/**
 * Artists directory loading skeleton
 * Matches the grid layout of the artists page
 */

const SKELETON_KEYS = Array.from(
  { length: 8 },
  (_, i) => `artist-skeleton-${i + 1}`
);

export default function ArtistsLoading() {
  return (
    <div className='min-h-screen bg-[#0D0E12]'>
      <div className='mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8'>
        {/* Page Header skeleton */}
        <div className='text-center mb-12'>
          <div className='mx-auto h-12 w-48 skeleton rounded-lg mb-4' />
          <div className='mx-auto h-6 w-80 skeleton rounded-md' />
        </div>

        {/* Creator Profiles Grid skeleton */}
        <div className='grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {SKELETON_KEYS.map(key => (
            <div key={key} className='text-center'>
              {/* Avatar skeleton */}
              <div className='mx-auto mb-4 h-24 w-24 skeleton rounded-full' />
              {/* Name skeleton */}
              <div className='mx-auto h-5 w-32 skeleton rounded-md mb-2' />
              {/* Bio skeleton */}
              <div className='mx-auto h-4 w-40 skeleton rounded-md' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
