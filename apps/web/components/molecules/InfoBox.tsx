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
    info: 'bg-info-subtle border-info/20',
    warning: 'bg-warning-subtle border-warning/20',
    success: 'bg-success-subtle border-success/20',
    error: 'bg-error-subtle border-error/20',
  };

  const titleClasses = {
    info: 'text-info-foreground',
    warning: 'text-warning-foreground',
    success: 'text-success-foreground',
    error: 'text-error-foreground',
  };

  const contentClasses = {
    info: 'text-info-foreground',
    warning: 'text-warning-foreground',
    success: 'text-success-foreground',
    error: 'text-error-foreground',
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
