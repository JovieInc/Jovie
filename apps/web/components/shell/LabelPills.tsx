import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LabelPillProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * LabelPill — single label badge used inside `LabelPills`. Exported so
 * callers can render an unwrapped pill (e.g. inside a tooltip or
 * detail row) without the +N collapse.
 */
export function LabelPill({ children, className }: LabelPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption text-tertiary-token bg-(--surface-1)/40 border border-(--linear-app-shell-border)/50 whitespace-nowrap',
        className
      )}
    >
      {children}
    </span>
  );
}

export interface LabelPillsProps {
  readonly labels: readonly string[];
  readonly className?: string;
}

/**
 * LabelPills — task-row label list. The first label is always
 * visible; remaining labels collapse into a "+N" chip that swaps to
 * the full set on hover (group-hover/labels). Empty array renders
 * nothing.
 *
 * @example
 * ```tsx
 * <LabelPills labels={task.labels} />
 * ```
 */
export function LabelPills({ labels, className }: LabelPillsProps) {
  if (labels.length === 0) return null;
  const [first, ...rest] = labels;
  return (
    <div
      className={cn('group/labels flex items-center gap-1 min-w-0', className)}
    >
      <LabelPill>{first}</LabelPill>
      {rest.length > 0 && (
        <>
          <span
            aria-hidden='true'
            className='inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption text-quaternary-token bg-(--surface-1)/60 border border-(--linear-app-shell-border)/50 group-hover/labels:hidden'
          >
            +{rest.length}
          </span>
          {rest.map(l => (
            <span key={l} className='hidden group-hover/labels:inline-flex'>
              <LabelPill>{l}</LabelPill>
            </span>
          ))}
        </>
      )}
    </div>
  );
}
