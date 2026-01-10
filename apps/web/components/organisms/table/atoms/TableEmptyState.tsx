'use client';

import { cn } from '@/lib/utils';

export interface TableEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  colSpan?: number;
}

export function TableEmptyState({
  title,
  description,
  icon,
  action,
  className,
  colSpan,
}: TableEmptyStateProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center min-h-[400px]',
        className
      )}
    >
      {icon && (
        <div className='mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-tertiary-token'>
          {icon}
        </div>
      )}
      <p className='text-sm font-medium text-primary-token'>{title}</p>
      {description && (
        <p className='mt-1 text-sm text-secondary-token max-w-md'>
          {description}
        </p>
      )}
      {action && <div className='mt-4'>{action}</div>}
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
