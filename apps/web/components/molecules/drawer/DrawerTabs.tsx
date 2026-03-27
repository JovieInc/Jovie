'use client';

import type { SegmentControlOption } from '@jovie/ui';
import type { ReactNode } from 'react';
import {
  TAB_BAR_DRAWER_TRIGGER_ACTIVE_CLASSNAME,
  TAB_BAR_DRAWER_TRIGGER_CLASSNAME,
  TAB_BAR_RAIL_CLASSNAME,
  TabBar,
} from '@/components/molecules/tab-bar/TabBar';

/**
 * Re-export classname constants for backward compatibility.
 * Used by AudienceHeaderBadge and tests.
 */
export const DRAWER_TABS_RAIL_CLASSNAME = TAB_BAR_RAIL_CLASSNAME;
export const DRAWER_TABS_TRIGGER_CLASSNAME = TAB_BAR_DRAWER_TRIGGER_CLASSNAME;
export const DRAWER_TABS_TRIGGER_ACTIVE_CLASSNAME =
  TAB_BAR_DRAWER_TRIGGER_ACTIVE_CLASSNAME;

export interface DrawerTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel: string;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly actionsClassName?: string;
  readonly triggerClassName?: string;
  readonly overflowMode?: 'collapse' | 'wrap' | 'scroll';
}

/**
 * DrawerTabs — tabbed navigation for sidebar drawers.
 *
 * Thin wrapper around TabBar with drawer variant styling.
 * Default overflow mode is 'collapse' (tabs that don't fit go into a "More" dropdown).
 * Pass overflowMode='scroll' for the legacy hidden-scrollbar behavior.
 */
export function DrawerTabs<T extends string>({
  overflowMode = 'collapse',
  ...props
}: DrawerTabsProps<T>) {
  return <TabBar {...props} overflowMode={overflowMode} variant='drawer' />;
}
