'use client';

import * as React from 'react';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  right?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  right,
  className,
}: SectionHeaderProps) {
  return (
    <div className={className ?? 'px-6 py-4 border-b border-subtle'}>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-medium text-primary-token'>{title}</h3>
          {description ? (
            <p className='text-sm text-secondary-token mt-1'>{description}</p>
          ) : null}
        </div>
        {right ? <div className='flex items-center gap-2'>{right}</div> : null}
      </div>
    </div>
  );
}
