'use client';

import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DspQuietRowProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly href?: string | null;
  readonly onFind?: () => void;
  readonly findLabel?: string;
  readonly className?: string;
  readonly testId?: string;
  readonly closedTabIndex?: number;
}

const DSP_QUIET_ROW_CLASS =
  'group flex min-h-8 items-center gap-2 rounded-md px-2 transition-[background-color] duration-subtle hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface)';

/** Track/release DSP row: name + ↗, or Find when the provider is not found. */
export function DspQuietRow({
  label,
  icon,
  href,
  onFind,
  findLabel = 'Find',
  className,
  testId,
  closedTabIndex,
}: DspQuietRowProps) {
  const hasHref = Boolean(href?.trim());

  if (hasHref && href) {
    return (
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        tabIndex={closedTabIndex}
        data-testid={testId}
        data-dsp-row='linked'
        className={cn(DSP_QUIET_ROW_CLASS, className)}
      >
        <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
          {icon}
        </span>
        <span className='min-w-0 flex-1 truncate text-xs text-primary-token'>
          {label}
        </span>
        <ExternalLink
          className='h-3 w-3 shrink-0 text-tertiary-token'
          aria-hidden='true'
        />
      </a>
    );
  }

  return (
    <div
      data-testid={testId}
      data-dsp-row='missing'
      className={cn(DSP_QUIET_ROW_CLASS, className)}
    >
      <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
        {icon}
      </span>
      <span className='min-w-0 flex-1 truncate text-xs text-secondary-token'>
        {label}
      </span>
      {onFind ? (
        <button
          type='button'
          onClick={onFind}
          tabIndex={closedTabIndex}
          className='shrink-0 text-2xs font-medium text-secondary-token hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55'
        >
          {findLabel}
        </button>
      ) : null}
    </div>
  );
}
