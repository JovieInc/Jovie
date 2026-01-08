import type { ReactNode } from 'react';

export interface TableEmptyStateProps {
  /** Optional icon to display */
  icon?: ReactNode;
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Primary action button/link */
  action?: ReactNode;
  /** Secondary action button/link */
  secondaryAction?: ReactNode;
}

/**
 * TableEmptyState - Consistent empty state for all tables
 *
 * Displayed in the center of the table container when no data is available.
 * Supports icon, title, description, and action buttons.
 */
export function TableEmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: TableEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center gap-4 text-center'>
      {icon && (
        <div className='flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-secondary-token'>
          {icon}
        </div>
      )}

      <div className='space-y-1'>
        <h3 className='text-base font-semibold text-primary-token'>{title}</h3>
        {description && (
          <p className='text-sm text-secondary-token'>{description}</p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className='flex items-center gap-2'>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
