import React from 'react';
import { cn } from '@/lib/utils';

type InfoBoxVariant = 'info' | 'warning' | 'success' | 'error';

interface InfoBoxProps {
  readonly title?: string;
  readonly variant?: InfoBoxVariant;
  readonly children: React.ReactNode;
  readonly className?: string;
}

const VARIANT_CONTAINER_CLASSES: Record<InfoBoxVariant, string> = {
  info: 'border-info/30 bg-info-subtle',
  warning: 'border-warning/30 bg-warning-subtle',
  success: 'border-success/30 bg-success-subtle',
  error: 'border-error/30 bg-error-subtle',
};

export function InfoBox({
  title,
  variant = 'info',
  children,
  className,
}: InfoBoxProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        VARIANT_CONTAINER_CLASSES[variant],
        className
      )}
    >
      {title && (
        <h3 className='mb-2 font-semibold text-primary-token'>{title}</h3>
      )}
      <div className='text-sm text-secondary-token'>{children}</div>
    </div>
  );
}
