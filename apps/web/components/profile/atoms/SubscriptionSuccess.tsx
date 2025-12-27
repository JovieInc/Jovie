'use client';

export interface SubscriptionSuccessProps {
  className?: string;
}

export function SubscriptionSuccess({ className }: SubscriptionSuccessProps) {
  return (
    <div className={className}>
      <div className='space-y-1'>
        <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/10 dark:shadow-white/10 transition-colors duration-200'>
          <svg
            className='w-5 h-5 mr-2 text-yellow-400 dark:text-yellow-300'
            viewBox='0 0 24 24'
            aria-hidden='true'
          >
            <title>Bell icon</title>
            <path
              d='M12 2a6 6 0 00-6 6v3.159c0 .538-.214 1.055-.595 1.436L4 15h16l-1.405-1.405A2.032 2.032 0 0118 11.159V8a6 6 0 00-6-6z'
              fill='currentColor'
            />
            <path
              d='M9 18a3 3 0 006 0'
              stroke='currentColor'
              strokeWidth={2}
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          <span className='font-semibold'>Subscribed to notifications</span>
        </div>
        <p className='text-xs text-center text-gray-600 dark:text-gray-400'>
          You&apos;ll now receive updates from this artist. Tap the bell to add
          another channel or unsubscribe.
        </p>
      </div>
    </div>
  );
}
