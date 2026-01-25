'use client';

import { cn } from '@/lib/utils';

export interface TableEmptyStateProps {
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional icon to display */
  icon?: React.ReactNode;
  /** Primary action button/link */
  action?: React.ReactNode;
  /** Secondary action button/link */
  secondaryAction?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** If provided, wraps content in <tr><td colSpan={colSpan}> */
  colSpan?: number;
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
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-12 px-4 text-center min-h-[400px]',
        className
      )}
    >
      {icon && (
        <div className='flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-secondary-token'>
          {icon}
        </div>
      )}
      <div className='space-y-1'>
        <p className='text-xl font-semibold text-primary-token'>{title}</p>
        {description && (
          <p className='text-sm text-tertiary-token max-w-md'>{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className='flex items-center gap-3'>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
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
