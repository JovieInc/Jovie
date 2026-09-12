'use client';

import { Button } from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DisclosureRowProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly summary?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

/** L3 inspector disclosure: collapsed content has no footprint. */
export function DisclosureRow({
  label,
  children,
  summary,
  defaultOpen = false,
  className,
  testId,
}: DisclosureRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div
      className={cn('min-w-0', className)}
      data-disclosure-level='l3'
      data-testid={testId}
    >
      <Button
        type='button'
        variant='link'
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(current => !current)}
        className={cn(
          'flex w-full min-h-8 items-center gap-2 rounded-md px-2 text-left',
          'transition-colors duration-subtle hover:bg-surface-1',
          'focus-visible:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring/55'
        )}
      >
        <span className='min-w-0 flex-1 truncate text-xs font-medium text-primary-token'>
          {label}
        </span>
        {summary ? (
          <span className='shrink-0 text-2xs text-tertiary-token'>
            {summary}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-subtle',
            !open && '-rotate-90'
          )}
          aria-hidden='true'
        />
      </Button>
      {open ? (
        <div id={contentId} className='px-2 pb-2 pt-1'>
          {children}
        </div>
      ) : null}
    </div>
  );
}
