'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AudienceDetailRowProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly className?: string;
}

export function AudienceDetailRow({
  label,
  value,
  className,
}: AudienceDetailRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[96px,minmax(0,1fr)] items-start gap-2',
        className
      )}
    >
      <div className='pt-0.5 text-xs text-secondary-token'>{label}</div>
      <div className='min-w-0 text-sm text-primary-token'>{value}</div>
    </div>
  );
}
