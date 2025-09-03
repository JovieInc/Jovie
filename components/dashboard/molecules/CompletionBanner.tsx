import React from 'react';

export function CompletionBanner(): JSX.Element {
  return (
    <div className='flex items-center gap-3 p-4 rounded-lg border border-subtle bg-surface-2'>
      <div className='flex-shrink-0'>
        <div className='h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center'>
          <span className='text-lg'>🎉</span>
        </div>
      </div>
      <div className='flex-1'>
        <p className='text-sm font-medium text-primary-token'>
          Your profile is ready!
        </p>
        <p className='text-xs text-secondary-token mt-1'>
          You&apos;ve completed all the essential setup steps.
        </p>
      </div>
    </div>
  );
}
