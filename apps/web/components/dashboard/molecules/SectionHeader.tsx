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
    <div className={className ?? 'px-6 py-5 border-b border-subtle'}>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-base font-semibold tracking-tight text-primary-token'>
            {title}
          </h3>
          {description ? (
            <p className='mt-1 text-sm leading-6 text-secondary-token'>
              {description}
            </p>
          ) : null}
        </div>
        {right ? <div className='flex items-center gap-2'>{right}</div> : null}
      </div>
    </div>
  );
}
