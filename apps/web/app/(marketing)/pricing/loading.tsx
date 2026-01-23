/**
 * Pricing page loading skeleton
 * Matches the three-tier pricing grid layout
 */

const TIER_SKELETON_KEYS = ['free-tier', 'pro-tier', 'growth-tier'] as const;
const FEATURE_SKELETON_KEYS = Array.from(
  { length: 5 },
  (_, i) => `feature-skeleton-${i + 1}`
);

export default function PricingLoading() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0a0a0b]'>
      <div className='mx-auto max-w-7xl px-4 py-20 sm:py-28 sm:px-6 lg:px-8'>
        {/* Header skeleton */}
        <div className='text-center mb-20'>
          <div className='mx-auto h-12 w-96 max-w-full skeleton rounded-lg mb-6' />
          <div className='mx-auto h-6 w-80 max-w-full skeleton rounded-md' />
        </div>

        {/* Three-tier pricing grid skeleton */}
        <div className='max-w-6xl mx-auto'>
          <div className='grid md:grid-cols-3 gap-6'>
            {TIER_SKELETON_KEYS.map(key => (
              <div
                key={key}
                className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8'
              >
                {/* Tier name */}
                <div className='h-4 w-16 skeleton rounded-md mb-4' />
                {/* Description */}
                <div className='h-4 w-40 skeleton rounded-md mb-4' />
                {/* Price */}
                <div className='flex items-baseline mb-6'>
                  <div className='h-10 w-16 skeleton rounded-md' />
                  <div className='ml-2 h-4 w-16 skeleton rounded-md' />
                </div>
                {/* CTA button */}
                <div className='h-10 w-full skeleton rounded-md mb-6' />
                {/* Features */}
                <div className='space-y-3'>
                  {FEATURE_SKELETON_KEYS.map(featureKey => (
                    <div key={`${key}-${featureKey}`} className='flex gap-3'>
                      <div className='h-4 w-4 skeleton rounded-full shrink-0 mt-0.5' />
                      <div className='h-4 flex-1 skeleton rounded-md' />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
