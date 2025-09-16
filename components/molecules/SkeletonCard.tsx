import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
  showIcon?: boolean;
}

export function SkeletonCard({
  className,
  showIcon = true,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'bg-surface-1 border border-subtle rounded-xl p-6 space-y-4',
        className
      )}
    >
      <div className='flex items-center justify-between'>
        <div className='space-y-2 flex-1'>
          {/* Title */}
          <div className='skeleton h-4 w-24 rounded-md' />
          {/* Large number */}
          <div className='skeleton h-8 w-16 rounded-lg' />
          {/* Metadata */}
          <div className='skeleton h-3 w-20 rounded-sm' />
        </div>
        {showIcon && (
          <div className='skeleton h-8 w-8 rounded-lg flex-shrink-0' />
        )}
      </div>
    </div>
  );
}
