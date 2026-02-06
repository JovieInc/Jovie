'use client';

import * as React from 'react';

export interface SectionHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly right?: React.ReactNode;
  readonly className?: string;
}

export function SectionHeader({
  title,
  description,
  right,
  className,
}: SectionHeaderProps) {
  return (
    <div className={className ?? 'px-4 py-4 sm:py-5 border-b border-subtle'}>
      <div className='flex items-start sm:items-center justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <h3 className='text-[15px] sm:text-base font-semibold tracking-tight text-primary-token'>
            {title}
          </h3>
          {description ? (
            <p className='mt-0.5 sm:mt-1 text-[13px] sm:text-sm leading-5 sm:leading-6 text-secondary-token'>
              {description}
            </p>
          ) : null}
        </div>
        {right ? (
          <div className='flex items-center gap-2 shrink-0'>{right}</div>
        ) : null}
      </div>
    </div>
  );
}
