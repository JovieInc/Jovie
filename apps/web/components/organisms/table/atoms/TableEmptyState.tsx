'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import { EmptyState } from '@/components/molecules/EmptyState';
import { cn } from '@/lib/utils';

export interface TableEmptyStateProps {
  /** Main title text */
  readonly title: string;
  /** Optional description text */
  readonly description?: string;
  /** Optional icon to display */
  readonly icon?: React.ReactNode;
  /**
   * Primary action. Prefer a pre-built node for table-specific CTAs that
   * already exist in toolbars; new call sites should pass structured
   * `EmptyState` actions via the molecule directly when possible.
   */
  readonly action?: React.ReactNode;
  /** Secondary action button/link */
  readonly secondaryAction?: React.ReactNode;
  /** Additional CSS classes */
  readonly className?: string;
  /** If provided, wraps content in <tr><td colSpan={colSpan}> */
  readonly colSpan?: number;
  readonly testId?: string;
}

/**
 * Table-scoped empty state. Composes the canonical EmptyState molecule and
 * optionally wraps in a table row for `<tbody>` placement.
 */
export function TableEmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
  colSpan,
  testId,
}: TableEmptyStateProps) {
  const hasLegacyActions = Boolean(action || secondaryAction);

  const content = (
    <DrawerSurfaceCard
      variant='card'
      className={cn(
        'flex min-h-55 flex-1 flex-col items-center justify-center rounded-lg bg-surface-0 px-4 py-6 text-center',
        className
      )}
    >
      <EmptyState
        icon={icon}
        heading={title}
        description={description}
        testId={testId}
        className='py-4'
      />
      {hasLegacyActions && (
        <div className='flex items-center gap-3 pb-4'>
          {action}
          {secondaryAction}
        </div>
      )}
    </DrawerSurfaceCard>
  );

  if (colSpan !== undefined) {
    return (
      <tr>
        <td colSpan={colSpan}>{content}</td>
      </tr>
    );
  }

  return content;
}
