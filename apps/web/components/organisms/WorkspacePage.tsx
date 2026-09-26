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
  return <PageShell {...panelProps} toolbar={toolbar} />;
}
