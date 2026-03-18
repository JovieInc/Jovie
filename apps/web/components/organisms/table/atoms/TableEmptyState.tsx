'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';

export interface TableEmptyStateProps {
  /** Main title text */
  readonly title: string;
  /** Optional description text */
  readonly description?: string;
  /** Optional icon to display */
  readonly icon?: React.ReactNode;
  /** Primary action button/link */
  readonly action?: React.ReactNode;
  /** Secondary action button/link */
  readonly secondaryAction?: React.ReactNode;
  /** Additional CSS classes */
  readonly className?: string;
  /** If provided, wraps content in <tr><td colSpan={colSpan}> */
  readonly colSpan?: number;
}

/**
 * Unified table empty state component.
 *
 * Displayed when a table has no data. Supports icon, title, description,
 * and primary/secondary action buttons.
 *
 * @example
 * // Basic usage
 * <TableEmptyState
 *   icon={<Users className="h-6 w-6" />}
 *   title="No users found"
 *   description="Try adjusting your search or filters"
 *   action={<Button>Add User</Button>}
 * />
 *
 * @example
 * // With colSpan for table row rendering
 * <TableEmptyState
 *   title="No data"
 *   colSpan={columns.length}
 * />
 */
export function TableEmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
  colSpan,
}: TableEmptyStateProps) {
  const content = (
    <DrawerSurfaceCard
      variant='card'
      className={cn(
        'flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 rounded-[10px] bg-surface-1/25 px-4 py-10 text-center',
        className
      )}
    >
      {icon && (
        <div className='flex h-9 w-9 items-center justify-center rounded-[8px] bg-surface-0/55 text-tertiary-token'>
          {icon}
        </div>
      )}
      <div className='space-y-1.5'>
        <p className='text-[13px] font-[510] text-secondary-token'>{title}</p>
        {description && (
          <p className='max-w-md text-[13px] text-tertiary-token'>
            {description}
          </p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className='flex items-center gap-3'>
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
