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
      'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
    warning:
      'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
    error: 'bg-[var(--color-error-subtle)] text-[var(--color-error)]',
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
          <p className='font-medium truncate' title={title}>{title}</p>
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
          <p className='text-sm text-secondary truncate' title={subtitle}>{subtitle}</p>
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
