import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ShellMetadataChipTone =
  | 'neutral'
  | 'soon'
  | 'warning'
  | 'danger'
  | 'muted';

const TONE_CLASSES: Record<ShellMetadataChipTone, string> = {
  neutral:
    'border-(--linear-app-shell-border)/70 bg-(--surface-1)/40 text-tertiary-token',
  soon: 'border-cyan-300/40 bg-cyan-500/10 text-cyan-200/90',
  warning: 'border-amber-500/20 bg-amber-500/5 text-amber-300/90',
  danger: 'border-red-500/20 bg-red-500/5 text-red-300/90',
  muted:
    'border-(--linear-app-shell-border)/45 bg-transparent text-quaternary-token',
};

export interface ShellMetadataChipProps {
  readonly children: ReactNode;
  readonly tone?: ShellMetadataChipTone;
  readonly icon?: ReactNode;
  readonly dotClassName?: string;
  readonly dotBorderClassName?: string;
  readonly title?: string;
  readonly className?: string;
  readonly contentClassName?: string;
}

/**
 * ShellMetadataChip — compact metadata badge for shell rows and drawers.
 *
 * This is intentionally presentational: callers own labels, dates, status
 * semantics, and click handling. The primitive owns only the common row-chip
 * geometry so release, task, and drawer metadata do not drift.
 */
export function ShellMetadataChip({
  children,
  tone = 'neutral',
  icon,
  dotClassName,
  dotBorderClassName,
  title,
  className,
  contentClassName,
}: Readonly<ShellMetadataChipProps>) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded border pl-1.5 pr-2 font-caption text-[10px] tracking-normal',
        TONE_CLASSES[tone],
        className
      )}
      title={title}
    >
      {icon ? <span className='shrink-0'>{icon}</span> : null}
      {dotClassName ? (
        <span
          aria-hidden='true'
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            dotClassName,
            dotBorderClassName && `border ${dotBorderClassName}`
          )}
        />
      ) : null}
      <span className={contentClassName}>{children}</span>
    </span>
  );
}
