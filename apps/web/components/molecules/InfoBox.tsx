import React from 'react';
import { cn } from '@/lib/utils';

interface InfoBoxProps {
  readonly title?: string;
  readonly variant?: 'info' | 'warning' | 'success' | 'error';
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function InfoBox({
  title,
  variant = 'info',
  children,
  className,
}: InfoBoxProps) {
  const variantClasses = {
    info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    warning:
      'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
    success:
      'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
    error: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  };

  const titleClasses = {
    info: 'text-blue-900 dark:text-blue-100',
    warning: 'text-yellow-900 dark:text-yellow-100',
    success: 'text-green-900 dark:text-green-100',
    error: 'text-red-900 dark:text-red-100',
  };

  const contentClasses = {
    info: 'text-blue-800 dark:text-blue-200',
    warning: 'text-yellow-800 dark:text-yellow-200',
    success: 'text-green-800 dark:text-green-200',
    error: 'text-red-800 dark:text-red-200',
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        variantClasses[variant],
        className
      )}
    >
      {title && (
        <h3 className={cn('font-semibold mb-2', titleClasses[variant])}>
          {title}
        </h3>
      )}
      <div className={cn('text-sm', contentClasses[variant])}>{children}</div>
    </div>
  );
}
