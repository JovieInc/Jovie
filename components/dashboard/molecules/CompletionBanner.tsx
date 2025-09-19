import React from 'react';

export function CompletionBanner(): JSX.Element {
  return (
    <div className='relative overflow-hidden rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 dark:border-green-800 dark:from-green-950/30 dark:to-emerald-950/30'>
      {/* Animated background pattern */}
      <div className='absolute inset-0 bg-gradient-to-r from-green-400/5 via-emerald-400/5 to-green-400/5 animate-pulse' />

      <div className='relative flex items-center gap-4 p-6'>
        <div className='flex-shrink-0'>
          <div className='h-12 w-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-200 dark:shadow-green-900/30'>
            <span className='text-2xl animate-bounce'>🎉</span>
          </div>
        </div>
        <div className='flex-1'>
          <div className='flex items-center gap-2 mb-1'>
            <h3 className='text-lg font-bold text-green-800 dark:text-green-200'>
              Profile Complete!
            </h3>
            <span className='inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300'>
              ✨ Ready to share
            </span>
          </div>
          <p className='text-sm text-green-700 dark:text-green-300 leading-relaxed'>
            Awesome! You&apos;ve completed all the essential setup steps. Your
            profile is now ready to share with your audience.
          </p>
        </div>
      </div>

      {/* Decorative elements */}
      <div className='absolute top-2 right-2 text-green-300/30 dark:text-green-600/30'>
        <svg className='w-6 h-6' fill='currentColor' viewBox='0 0 20 20'>
          <path
            fillRule='evenodd'
            d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
            clipRule='evenodd'
          />
        </svg>
      </div>
    </div>
  );
}
