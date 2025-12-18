'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AuthLinkPreviewCardProps {
  label: string;
  hrefText: string;
  trailing?: React.ReactNode;
  className?: string;
}

export function AuthLinkPreviewCard({
  label,
  hrefText,
  trailing,
  className,
}: AuthLinkPreviewCardProps) {
  return (
    <div
      className={cn(
        'w-full rounded-lg border border-white/10 bg-[#15161a] px-4 py-3',
        className
      )}
    >
      <p className='text-[#6b6f76] text-xs sm:text-sm font-medium text-center'>
        {label}
      </p>
      <div className='mt-1 flex items-start justify-center gap-2'>
        <p className='font-mono text-[rgb(227,228,230)] text-base sm:text-lg break-all max-w-full font-semibold text-center'>
          {hrefText}
        </p>
        {trailing ? <div className='shrink-0'>{trailing}</div> : null}
      </div>
    </div>
  );
}
