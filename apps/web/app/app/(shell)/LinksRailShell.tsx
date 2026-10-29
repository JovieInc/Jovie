'use client';

import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { LinksRailTransformProvider } from '@/contexts/links-rail-transform';
import {
  LinksRailContent,
  type LinksRailContentProps,
} from './links/LinksRailContent';

function isLinksRailContent(
  panel: ReactNode
): panel is ReactElement<LinksRailContentProps> {
  return isValidElement(panel) && panel.type === LinksRailContent;
}

function wrapLinksRail(panel: ReactNode): ReactNode {
  if (!isLinksRailContent(panel)) return panel;
  const { title, onClose, children } = panel.props;
  return (
    <EntitySidebarShell
      isOpen
      ariaLabel='Link Details'
      title={title}
      onClose={onClose}
      scrollStrategy='shell'
      data-testid='links-inspector'
    >
      {children}
    </EntitySidebarShell>
  );
}

/**
 * App-shell-only owner of the entity rail. Demo shells do not mount this, so
 * the rail module stays off the /demo first-load graph.
 */
export function LinksRailShellProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <LinksRailTransformProvider value={wrapLinksRail}>
      {children}
    </LinksRailTransformProvider>
  );
}
