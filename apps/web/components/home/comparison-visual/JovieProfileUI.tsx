'use client';

import { cn } from '@/lib/utils';

interface JovieProfileUIProps {
  activeIndex: number;
}

export function JovieProfileUI({ activeIndex }: JovieProfileUIProps) {
  return (
    <div className='flex flex-col gap-3'>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={cn(
            'h-10 w-48 rounded-lg transition-all duration-500',
            i === activeIndex
              ? 'bg-btn-primary-bg opacity-100 scale-100'
              : 'bg-surface-2/30 opacity-30 scale-95'
          )}
        />
      ))}
    </div>
  );
}
