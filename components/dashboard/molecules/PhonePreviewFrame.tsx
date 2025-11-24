'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface PhonePreviewFrameProps {
  children: ReactNode;
  className?: string;
}

export function PhonePreviewFrame({
  children,
  className,
}: PhonePreviewFrameProps) {
  return (
    <div className={cn('relative', className)}>
      {/* Glass background */}
      <div
        className={cn(
          'absolute inset-0 -z-10 rounded-[2.5rem]',
          'bg-gradient-to-br from-gray-50/80 to-gray-100/80 dark:from-gray-900/80 dark:to-gray-800/80',
          'backdrop-blur-xl border border-white/20',
          'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]',
          'transition-all duration-300',
          'pointer-events-none'
        )}
        aria-hidden='true'
      />

      {/* Phone frame */}
      <div
        className={cn(
          'relative w-full max-w-[300px] mx-auto',
          'aspect-[9/19] rounded-[2.5rem] p-2',
          'bg-gray-900 text-white shadow-2xl',
          'overflow-hidden border-[10px] border-gray-900',
          'transition-all duration-300'
        )}
      >
        {/* Phone notch */}
        <div className='absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-gray-900 rounded-b-xl z-10' />

        {children}
      </div>
    </div>
  );
}
