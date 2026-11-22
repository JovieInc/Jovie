'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  contentRowType,
  ShellListRowFrame,
  type ShellListRowInteraction,
} from '../atoms/ShellListRowFrame';

export interface TaskProjectionListRowProps {
  readonly testId: string;
  readonly leading: ReactNode;
  readonly title?: ReactNode;
  readonly titleAfter?: ReactNode;
  readonly titleClassName?: string;
  readonly metadata: ReactNode;
  readonly actionSlot?: ReactNode;
  readonly isSelected?: boolean;
  /**
   * `none` (default) when a table wrapper already paints hover/selected (Tasks).
   * `self` when the row stands alone (Fleet) so it paints its own states.
   */
  readonly interaction?: Extract<ShellListRowInteraction, 'self' | 'none'>;
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
  interaction = 'none',
  opacity = 'full',
}: Readonly<TaskProjectionListRowProps>) {
  return (
    <ShellListRowFrame
      data-testid={testId}
      isSelected={isSelected}
      interaction={interaction}
      density='standard'
      className={cn(
        'group/row flex h-full w-full items-center gap-2 px-3 transition-opacity duration-subtle ease-subtle',
        // 90 keeps muted-row secondary text >= 4.5:1 on the light canvas;
        // 75 composited it to 3.56:1 (axe color-contrast).
        opacity === 'muted' && !isSelected && 'opacity-90',
        opacity === 'quiet' && !isSelected && 'opacity-60'
      )}
    >
      <span className='flex shrink-0 items-center'>{leading}</span>
      <div className='min-w-0 flex-1'>
        {title == null ? null : (
          <div className='flex min-w-0 items-center gap-1.5'>
            <p
              className={cn(
                'min-w-0 truncate',
                contentRowType.title,
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
