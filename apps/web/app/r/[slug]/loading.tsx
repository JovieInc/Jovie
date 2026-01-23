/**
 * Release smart link loading skeleton
 * Matches the landing page layout with artwork and provider buttons
 */

const PROVIDER_SKELETON_KEYS = Array.from(
  { length: 5 },
  (_, i) => `provider-skeleton-${i + 1}`
);

export default function ReleaseLoading() {
  return (
    <div className='min-h-screen bg-[#0D0E12] flex items-center justify-center p-4'>
      <div className='w-full max-w-md text-center space-y-8'>
        {/* Artwork skeleton */}
        <div className='mx-auto h-64 w-64 skeleton rounded-xl' />

        {/* Title and artist skeleton */}
        <div className='space-y-3'>
          <div className='mx-auto h-8 w-48 skeleton rounded-md' />
          <div className='mx-auto h-5 w-32 skeleton rounded-md' />
        </div>

        {/* Provider buttons skeleton */}
        <div className='space-y-3'>
          {PROVIDER_SKELETON_KEYS.map(key => (
            <div key={key} className='h-12 w-full skeleton rounded-lg' />
          ))}
        </div>
      </div>
    </div>
  );
}
