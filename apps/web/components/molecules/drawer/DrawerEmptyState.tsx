'use client';

import { cn } from '@/lib/utils';

export interface DrawerEmptyStateProps {
  readonly message: string;
  readonly className?: string;
}

export function DrawerEmptyState({
  message,
  className,
}: DrawerEmptyStateProps) {
  return (
    <p className={cn('text-[13px] text-quaternary-token', className)}>
      {message}
    </p>
  );
}
