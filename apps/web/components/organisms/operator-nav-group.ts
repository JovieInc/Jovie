'use client';

import { useEffect, useState } from 'react';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import type { OperatorNavSection } from './operator-navigation';

/** Tools keeps its original key so saved preferences survive; others append the id. */
export const operatorGroupOpenKey = (id: string) =>
  id === 'tools' ? 'ovie.nav.tools-open.v1' : `ovie.nav.${id}-open.v1`;

/** Hairline that sets the pinned current page apart in the collapsed rail. */
export const OPERATOR_RAIL_PINNED_GROUP_CLASS =
  'mx-(--app-shell-sidebar-inset) border-t border-subtle pt-4';

/**
 * Which items a group shows. Expanded: a collapsible group opens when the
 * viewer opened it or it holds the current page. Collapsed rail: it is a calm
 * launcher, so a collapsible group shows only the current page (Tim, Nov 14:
 * the collapsed Mac rail read as ~25 unlabelled icons). Peek reads as open and
 * floats the full labelled menu, so nothing becomes unreachable.
 */
export function resolveOperatorNavGroup<T extends Pick<NavItem, 'href'>>({
  collapsible,
  items,
  isActive,
  stored,
  railCollapsed,
}: {
  readonly collapsible: boolean;
  readonly items: readonly T[];
  readonly isActive: (item: T) => boolean;
  readonly stored: boolean;
  readonly railCollapsed: boolean;
}) {
  const holdsActive = items.some(isActive);
  const railFiltered = railCollapsed && collapsible;
  return {
    holdsActive,
    open: !collapsible || holdsActive || (stored && !railCollapsed),
    items: railFiltered ? items.filter(isActive) : items,
    pinnedInRail: railFiltered && holdsActive,
  };
}

/** The viewer's remembered open/closed choice for one collapsible group. */
export function useOperatorGroupOpen(section: OperatorNavSection) {
  const [stored, setStored] = useState(false);
  useEffect(() => {
    if (!section.collapsible) return;
    try {
      setStored(
        globalThis.localStorage?.getItem(operatorGroupOpenKey(section.id)) ===
          '1'
      );
    } catch {
      // Storage is a per-viewer convenience; the group defaults to closed.
    }
  }, [section.collapsible, section.id]);
  const toggle = () => {
    const next = !stored;
    setStored(next);
    try {
      globalThis.localStorage?.setItem(
        operatorGroupOpenKey(section.id),
        next ? '1' : '0'
      );
    } catch {
      // Ignore unavailable storage.
    }
  };
  return { stored, toggle };
}
