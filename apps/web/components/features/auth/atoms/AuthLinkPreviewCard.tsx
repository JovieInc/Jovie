'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AuthLinkPreviewCardProps {
  readonly label: string;
  readonly hrefText: string;
  readonly trailing?: React.ReactNode;
  readonly className?: string;
}

export function AuthLinkPreviewCard({
  label,
  hrefText,
  trailing,
  className,
}: Readonly<AuthLinkPreviewCardProps>) {
  return (
    <div
      className={cn(
        'w-full rounded-[--radius-lg] border border-subtle bg-surface-0 px-4 py-3',
        className
      )}
    >
      <p className='text-secondary-token text-xs sm:text-sm font-medium text-center'>
        {label}
      </p>
      <div className='mt-1 flex items-start justify-center gap-2'>
        <p className='font-sans text-primary-token text-base sm:text-lg break-all max-w-full font-semibold text-center'>
          {hrefText}
        </p>
        {trailing ? <div className='shrink-0'>{trailing}</div> : null}
      </div>
    </div>
  );
}
