'use client';

import type { ReactNode } from 'react';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';

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
    <AppShellContentPanel
      toolbar={toolbar}
      maxWidth='full'
      frame='none'
      contentPadding='none'
      scroll='panel'
      className={className}
      surfaceClassName={surfaceClassName}
      contentClassName={contentClassName}
      data-testid={testId}
    >
      {children}
    </AppShellContentPanel>
  );
}
