'use client';

import { cn } from '@/lib/utils';

export interface StatusBarMockProps {
  readonly className?: string;
}

export function StatusBarMock({ className }: StatusBarMockProps) {
  return (
    <div
      className={cn(
        'bg-surface-2 h-7 flex items-center justify-between px-4 relative z-20',
        className
      )}
    >
      <span className='text-[10px] font-semibold text-primary-token'>9:41</span>
      <div className='flex items-center gap-1'>
        <div className='flex items-end gap-0.5'>
          <div className='w-0.5 h-1 rounded bg-(--fg)' />
          <div className='w-0.5 h-1.5 rounded bg-(--fg)' />
          <div className='w-0.5 h-2 rounded bg-(--fg)' />
          <div className='w-0.5 h-2.5 rounded bg-(--fg)' />
        </div>
        <div className='w-5 h-3 rounded-sm relative border border-(--fg)'>
          <div className='w-full h-full rounded-sm scale-x-80 origin-left bg-accent' />
          <div className='absolute -right-0.5 top-0.5 w-0.5 h-2 rounded-r-sm bg-(--fg)' />
        </div>
      </div>
    </div>
  );
}
