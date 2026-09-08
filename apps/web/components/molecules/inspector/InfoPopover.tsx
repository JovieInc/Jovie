'use client';

import { IconButton, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InfoPopoverProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly align?: 'start' | 'center' | 'end';
  readonly className?: string;
  readonly contentClassName?: string;
  readonly testId?: string;
}

/** L2 inspector helper: ⓘ opens copy that must not persist in a compact row. */
export function InfoPopover({
  label,
  children,
  side = 'top',
  align = 'end',
  className,
  contentClassName,
  testId,
}: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          type='button'
          variant='inline'
          size='xs'
          aria-label={label}
          data-testid={testId}
          data-disclosure-level='l2'
          className={cn(
            'text-tertiary-token hover:text-secondary-token',
            className
          )}
        >
          <Info className='h-3.5 w-3.5' aria-hidden='true' />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className={cn(
          'max-w-64 text-2xs leading-4 text-secondary-token',
          contentClassName
        )}
        testId={testId ? `${testId}-content` : 'inspector-info-popover'}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
