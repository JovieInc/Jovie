'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DashboardWorkspacePanelProps {
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly surfaceClassName?: string;
  readonly contentClassName?: string;
  readonly 'data-testid'?: string;
}

export function DashboardWorkspacePanel({
  toolbar,
  children,
  className,
  surfaceClassName,
  contentClassName,
  'data-testid': testId,
}: Readonly<DashboardWorkspacePanelProps>) {
  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        className
      )}
      data-testid={testId}
    >
      {toolbar ? <div className='shrink-0'>{toolbar}</div> : null}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden bg-(--linear-app-content-surface)',
          surfaceClassName
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
