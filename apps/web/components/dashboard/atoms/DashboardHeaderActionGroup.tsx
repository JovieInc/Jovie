'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DashboardHeaderActionGroup({
  children,
  trailing,
  className,
  leadingClassName,
  trailingClassName,
}: {
  readonly children?: ReactNode;
  readonly trailing?: ReactNode;
  readonly className?: string;
  readonly leadingClassName?: string;
  readonly trailingClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-(--linear-app-toolbar-gap)',
        className
      )}
    >
      {children ? (
        <div
          className={cn(
            'flex min-w-0 items-center gap-(--linear-app-toolbar-gap)',
            leadingClassName
          )}
        >
          {children}
        </div>
      ) : null}
      {trailing ? (
        <div
          className={cn(
            'ml-auto flex shrink-0 items-center gap-(--linear-app-toolbar-gap)',
            trailingClassName
          )}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
