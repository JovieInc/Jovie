import type { ReactNode } from 'react';

export interface LinksRailContentProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Marker the app shell wraps in EntitySidebarShell. This file does not import
 * the shell: a links-page edge to that module regroups shared demo chunks
 * over the route JS budget.
 */
export function LinksRailContent({ children }: LinksRailContentProps) {
  return children;
}
