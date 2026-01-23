/**
 * Notifications page loading skeleton
 * Matches the form layout
 */
export default function NotificationsLoading() {
  return (
    <div className='container mx-auto px-4 py-8 max-w-md'>
      {/* Title skeleton */}
      <div className='h-8 w-64 skeleton rounded-lg mb-6' />

      {/* Form skeleton */}
      <div className='space-y-4'>
        {/* Label */}
        <div className='space-y-2'>
          <div className='h-4 w-12 skeleton rounded-md' />
          <div className='h-10 w-full skeleton rounded-lg' />
        </div>

        {/* Submit button */}
        <div className='h-10 w-full skeleton rounded-lg' />

        {/* Terms text */}
        <div className='h-3 w-3/4 skeleton rounded-md' />
      </div>
    </div>
  );
}
