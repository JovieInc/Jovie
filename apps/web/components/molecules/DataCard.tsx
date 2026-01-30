import React from 'react';
import { cn } from '@/lib/utils';

interface DataCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly metadata?: string;
  readonly badge?: string;
  readonly badgeVariant?: 'default' | 'success' | 'warning' | 'error';
  readonly actions?: React.ReactNode;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

export function DataCard({
  title,
  subtitle,
  metadata,
  badge,
  badgeVariant = 'default',
  actions,
  className,
  children,
}: DataCardProps) {
  const badgeClasses = {
    default: 'bg-surface-hover text-secondary',
    success:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    warning:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border border-subtle bg-surface p-3 shadow-sm transition-colors',
        className
      )}
    >
      <div className='flex-1 min-w-0'>
        <div className='flex items-center space-x-2'>
          <p className='font-medium truncate'>{title}</p>
          {badge && badge.trim() !== '' && (
            <span
              className={cn(
                'inline-block px-2 py-1 text-xs rounded-full',
                badgeClasses[badgeVariant]
              )}
            >
              {badge}
            </span>
          )}
        </div>
        {subtitle && subtitle.trim() !== '' && (
          <p className='text-sm text-secondary truncate'>{subtitle}</p>
        )}
        {metadata && metadata.trim() !== '' && (
          <p className='text-xs text-secondary'>{metadata}</p>
        )}
        {children}
      </div>
      {actions && <div className='flex-shrink-0 ml-4'>{actions}</div>}
    </div>
  );
}
