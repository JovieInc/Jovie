import React from 'react';

export function CompletionBanner(): JSX.Element {
  return (
    <div className='group relative overflow-hidden rounded-xl ring-1 ring-status-success/20 backdrop-blur-sm shadow-floating transition-all duration-300 ease-out hover:shadow-large hover:-translate-y-0.5'>
      {/* Sophisticated background layers */}
      <div className='absolute inset-0 bg-gradient-to-br from-status-success/8 via-status-success/4 to-transparent' />
      <div className='absolute inset-0 bg-gradient-to-r from-transparent via-status-success/5 to-transparent group-hover:opacity-80 transition-opacity duration-500' />

      {/* Animated shimmer effect */}
      <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 ease-out' />

      <div className='relative flex items-center gap-5 p-6'>
        {/* Enhanced celebration icon */}
        <div className='flex-shrink-0'>
          <div className='relative h-14 w-14 rounded-full bg-gradient-to-br from-status-success to-status-success/80 flex items-center justify-center shadow-lg shadow-status-success/25 ring-2 ring-status-success/20 ring-offset-2 ring-offset-surface-base'>
            {/* Pulsing glow effect */}
            <div className='absolute inset-0 rounded-full bg-status-success animate-ping opacity-20' />
            <div className='absolute inset-0 rounded-full bg-status-success animate-pulse opacity-30' />

            {/* Celebration icon */}
            <div className='relative z-10 text-2xl animate-bounce'>🎉</div>
          </div>
        </div>

        {/* Enhanced content section */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-3 mb-2'>
            <h3 className='text-lg font-bold text-status-success tracking-tight'>
              Profile Complete!
            </h3>
            <div className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-status-success/10 ring-1 ring-status-success/20 backdrop-blur-sm'>
              <div className='w-1.5 h-1.5 rounded-full bg-status-success animate-pulse' />
              <span className='text-[10px] font-bold text-status-success uppercase tracking-wider'>
                Ready to Share
              </span>
            </div>
          </div>
          <p className='text-sm text-status-success/80 leading-relaxed max-w-lg'>
            Excellent work! You&apos;ve completed all essential setup steps.
            Your professional profile is now live and ready to share with your
            audience.
          </p>
        </div>
      </div>

      {/* Sophisticated decorative elements */}
      <div className='absolute top-3 right-3 text-status-success/20 group-hover:text-status-success/30 transition-colors duration-300'>
        <svg
          className='w-6 h-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12'
          fill='currentColor'
          viewBox='0 0 20 20'
        >
          <path
            fillRule='evenodd'
            d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
            clipRule='evenodd'
          />
        </svg>
      </div>

      {/* Corner accent */}
      <div className='absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-status-success/10 to-transparent rounded-tl-3xl' />
    </div>
  );
}
