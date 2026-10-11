import type { ReactElement } from 'react';
import {
  PageShell,
  type PageShellProps,
} from '@/components/organisms/PageShell';

export interface WorkspacePageProps extends Omit<PageShellProps, 'toolbar'> {
  /** The one route toolbar below the shell-owned `DashboardHeader`. */
  readonly toolbar: ReactElement;
}

/**
 * Canonical authenticated workspace composition: the shell-owned breadcrumb
 * header, one route toolbar, then the shared workspace panel.
 */
export function WorkspacePage({ toolbar, ...panelProps }: WorkspacePageProps) {
  if (panelProps.surfaceMode === 'table') {
    return <PageShell {...panelProps} surfaceMode='table' toolbar={toolbar} />;
  }

  return <PageShell {...panelProps} frame='none' toolbar={toolbar} />;
}
