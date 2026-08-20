'use client';

import type { CommonDropdownItem, SegmentControlOption } from '@jovie/ui';
import type { ReactNode } from 'react';
import { DrawerTabbedCard } from './DrawerTabbedCard';
import { DrawerTabs } from './DrawerTabs';
import { EntitySidebarShell } from './EntitySidebarShell';

export interface EntityTabbedRailProps<T extends string> {
  readonly isOpen: boolean;
  readonly ariaLabel: string;
  readonly activeTab: T;
  readonly onTabChange: (value: T) => void;
  readonly tabOptions: readonly SegmentControlOption<T>[];
  readonly tabsAriaLabel: string;
  readonly entityHeader?: ReactNode;
  readonly title?: ReactNode;
  readonly onClose?: () => void;
  readonly hideMinimalHeaderBar?: boolean;
  readonly contextMenuItems?: CommonDropdownItem[];
  readonly isEmpty?: boolean;
  readonly emptyMessage?: string;
  readonly sectionKind?: 'facts' | 'links' | 'status' | 'details';
  readonly controls?: ReactNode;
  readonly children: ReactNode;
  readonly contentClassName?: string;
  readonly tabsContainerClassName?: string;
  readonly tabbedCardTestId?: string;
  readonly testId?: string;
  readonly tabDistribution?: 'intrinsic' | 'fill';
  readonly tabOverflowMode?: 'collapse' | 'wrap' | 'scroll';
}

/**
 * Strict one-surface contract for tabbed entity inspectors.
 *
 * The outer rail owns the background and left seam. Identity, navigation,
 * content, feedback, and empty states stay flat; only portalled menus and
 * popovers may rise above this surface.
 */
export function EntityTabbedRail<T extends string>({
  isOpen,
  ariaLabel,
  activeTab,
  onTabChange,
  tabOptions,
  tabsAriaLabel,
  entityHeader,
  title,
  onClose,
  hideMinimalHeaderBar = true,
  contextMenuItems,
  isEmpty = false,
  emptyMessage,
  sectionKind,
  controls,
  children,
  contentClassName,
  tabsContainerClassName,
  tabbedCardTestId,
  testId,
  tabDistribution = 'fill',
  tabOverflowMode = 'collapse',
}: EntityTabbedRailProps<T>) {
  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel={ariaLabel}
      title={title}
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar={hideMinimalHeaderBar}
      entityHeaderSurface='flat'
      workspaceSurface='flat'
      contextMenuItems={contextMenuItems}
      data-testid={testId}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      entityHeader={entityHeader}
    >
      {!isEmpty ? (
        <DrawerTabbedCard
          testId={tabbedCardTestId}
          sectionKind={sectionKind}
          surfaceVariant='flat'
          controls={controls}
          tabsContainerClassName={tabsContainerClassName}
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={onTabChange}
              options={tabOptions}
              ariaLabel={tabsAriaLabel}
              distribution={tabDistribution}
              overflowMode={tabOverflowMode}
            />
          }
          contentClassName={contentClassName}
        >
          {children}
        </DrawerTabbedCard>
      ) : null}
    </EntitySidebarShell>
  );
}
