/**
 * Loading skeleton for the waitlist page.
 */
export default function WaitlistLoading() {
  return (
    <div className='flex min-h-screen items-center justify-center p-4 bg-white dark:bg-[#0D0E12]'>
      <div className='w-full max-w-md space-y-8 text-center'>
        {/* Logo skeleton */}
        <div className='flex justify-center'>
          <div className='h-16 w-16 skeleton rounded-xl' />
        </div>

        {/* Title skeleton */}
        <div className='space-y-3'>
          <div className='mx-auto h-10 w-72 skeleton rounded-md' />
          <div className='mx-auto h-5 w-80 skeleton rounded-md' />
        </div>

        {/* Form skeleton */}
        <div className='space-y-4'>
          <div className='h-12 w-full skeleton rounded-lg' />
          <div className='h-12 w-full skeleton rounded-lg' />
        </div>

        {/* Stats skeleton */}
        <div className='flex justify-center gap-8 pt-4'>
          <div className='space-y-1'>
            <div className='mx-auto h-8 w-16 skeleton rounded-md' />
            <div className='mx-auto h-4 w-24 skeleton rounded-md' />
          </div>
          <div className='space-y-1'>
            <div className='mx-auto h-8 w-20 skeleton rounded-md' />
            <div className='mx-auto h-4 w-20 skeleton rounded-md' />
          </div>
        </div>
      </div>
    </div>
  );
}
