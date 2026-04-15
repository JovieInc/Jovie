/**
 * Loading skeleton for public artist profile pages.
 *
 * Shows a minimal, themed placeholder while the profile data is fetched
 * on client-side navigation between profiles.
 */
export default function ProfileLoading() {
  return (
    <div className='min-h-dvh bg-base'>
      <div className='mx-auto max-w-2xl px-4 pt-24 pb-16'>
        {/* Avatar placeholder */}
        <div className='flex flex-col items-center'>
          <div className='h-24 w-24 rounded-full bg-surface-raised animate-pulse' />
          {/* Name placeholder */}
          <div className='mt-4 h-6 w-40 rounded-lg bg-surface-raised animate-pulse' />
          {/* Handle placeholder */}
          <div className='mt-2 h-4 w-24 rounded-md bg-surface-raised animate-pulse' />
        </div>

        {/* Bio placeholder */}
        <div className='mt-8 space-y-2'>
          <div className='mx-auto h-3 w-full max-w-xs rounded bg-surface-raised animate-pulse' />
          <div className='mx-auto h-3 w-3/4 max-w-xs rounded bg-surface-raised animate-pulse' />
        </div>

        {/* Link buttons placeholder */}
        <div className='mt-10 space-y-3'>
          <div className='mx-auto h-12 w-full max-w-sm rounded-xl bg-surface-raised animate-pulse' />
          <div className='mx-auto h-12 w-full max-w-sm rounded-xl bg-surface-raised animate-pulse' />
          <div className='mx-auto h-12 w-full max-w-sm rounded-xl bg-surface-raised animate-pulse' />
        </div>
      </div>
    </div>
  );
}
