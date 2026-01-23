/**
 * Loading skeleton for the onboarding page.
 */
export default function OnboardingLoading() {
  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <div className='w-full max-w-xl space-y-8'>
        {/* Progress bar skeleton */}
        <div className='h-2 w-full skeleton rounded-full' />

        {/* Header skeleton */}
        <div className='space-y-3 text-center'>
          <div className='mx-auto h-10 w-64 skeleton rounded-md' />
          <div className='mx-auto h-5 w-80 skeleton rounded-md' />
        </div>

        {/* Content card skeleton */}
        <div className='rounded-xl border border-subtle bg-surface-1 p-8 space-y-6'>
          {/* Avatar upload area skeleton */}
          <div className='flex justify-center'>
            <div className='h-24 w-24 skeleton rounded-full' />
          </div>

          {/* Form fields skeleton */}
          <div className='space-y-4'>
            <div className='space-y-2'>
              <div className='h-4 w-24 skeleton rounded-md' />
              <div className='h-10 w-full skeleton rounded-md' />
            </div>
            <div className='space-y-2'>
              <div className='h-4 w-20 skeleton rounded-md' />
              <div className='h-10 w-full skeleton rounded-md' />
            </div>
            <div className='space-y-2'>
              <div className='h-4 w-16 skeleton rounded-md' />
              <div className='h-24 w-full skeleton rounded-md' />
            </div>
          </div>
        </div>

        {/* Button skeleton */}
        <div className='h-12 w-full skeleton rounded-lg' />
      </div>
    </div>
  );
}
