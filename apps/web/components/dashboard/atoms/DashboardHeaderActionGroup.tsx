'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DashboardHeaderActionGroup({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-[var(--linear-app-toolbar-gap)]',
        className
      )}
    >
      {children}
    </div>
  );
}
