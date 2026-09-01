'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ShellListRowFrame } from '../atoms/ShellListRowFrame';

export interface TaskProjectionListRowProps {
  readonly testId: string;
  readonly leading: ReactNode;
  readonly title?: ReactNode;
  readonly titleAfter?: ReactNode;
  readonly titleClassName?: string;
  readonly metadata: ReactNode;
  readonly actionSlot?: ReactNode;
  readonly isSelected?: boolean;
  readonly opacity?: 'full' | 'muted' | 'quiet';
}

/** Shared task-row anatomy. Customer tasks and operational projections adapt into it. */
export function TaskProjectionListRow({
  testId,
  leading,
  title,
  titleAfter,
  titleClassName,
  metadata,
  actionSlot,
  isSelected = false,
  opacity = 'full',
}: Readonly<TaskProjectionListRowProps>) {
  return (
    <ShellListRowFrame
      data-testid={testId}
      isSelected={isSelected}
      interaction='none'
      className={cn(
        'group/row flex h-full w-full items-center gap-2 px-3 py-1 transition-[opacity] duration-subtle ease-subtle',
        opacity === 'muted' && !isSelected && 'opacity-75',
        opacity === 'quiet' && !isSelected && 'opacity-60'
      )}
    >
      <span className='flex shrink-0 items-center'>{leading}</span>
      <div className='min-w-0 flex-1'>
        {title == null ? null : (
          <div className='flex min-w-0 items-center gap-1.5'>
            <p
              className={cn(
                'min-w-0 truncate text-app font-semibold leading-tight text-primary-token',
                titleClassName
              )}
            >
              {title}
            </p>
            {titleAfter}
          </div>
        )}
        {metadata}
      </div>
      <div className='flex shrink-0 items-center justify-end'>{actionSlot}</div>
    </ShellListRowFrame>
  );
}
