'use client';

// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import type { CommonDropdownItem, SegmentControlOption } from '@jovie/ui';
import type { ReactNode } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { InspectorEmpty } from './InspectorEmpty';
import { InspectorLoading } from './InspectorLoading';
import { InspectorTabs } from './InspectorTabs';

export const INSPECTOR_TAB_PANEL_ID = 'inspector-tab-panel';

export interface InspectorRailProps<T extends string> {
  readonly isOpen: boolean;
  readonly ariaLabel: string;
  readonly objectHeader?: ReactNode;
  readonly tabs: readonly SegmentControlOption<T>[];
  readonly activeTab: T;
  readonly onTabChange: (value: T) => void;
  readonly tabsAriaLabel: string;
  readonly children: ReactNode;
  readonly isEmpty?: boolean;
  readonly emptyMessage?: string;
  readonly isLoading?: boolean;
  readonly onClose?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly contextMenuItems?: CommonDropdownItem[];
  readonly testId?: string;
  readonly width?: number;
}

/**
 * Canonical right-rail Inspector shell.
 *
 * Sticky object header + real tabs. Tab content scrolls. This surface
 * answers: What is this? What does Jovie know? What can I do to THIS object?
 * It is not a task inbox.
 */
export function InspectorShell<T extends string>({
  isOpen,
  ariaLabel,
  objectHeader,
  tabs,
  activeTab,
  onTabChange,
  tabsAriaLabel,
  children,
  isEmpty = false,
  emptyMessage = 'Select an item to inspect.',
  isLoading = false,
  onClose,
  onKeyDown,
  contextMenuItems,
  testId = 'inspector-shell',
  width,
}: InspectorRailProps<T>) {
  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={width}
      ariaLabel={ariaLabel}
      onKeyDown={onKeyDown}
      onClose={onClose}
      contextMenuItems={contextMenuItems}
      data-testid={testId}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      workspaceSurface='flat'
      scrollStrategy='child'
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      entityHeader={objectHeader}
    >
      {isLoading ? (
        <InspectorLoading />
      ) : (
        <div
          className='flex min-h-0 flex-1 flex-col overflow-hidden'
          data-testid='inspector-tabbed-body'
          data-inspector-shell='true'
        >
          <div className='shrink-0 border-b border-(--app-shell-frame-seam) px-3'>
            <InspectorTabs
              value={activeTab}
              onValueChange={onTabChange}
              options={tabs}
              ariaLabel={tabsAriaLabel}
              panelId={INSPECTOR_TAB_PANEL_ID}
            />
          </div>
          <div
            id={INSPECTOR_TAB_PANEL_ID}
            role='tabpanel'
            data-testid='inspector-tab-panel'
            data-scroll-mode='internal'
            className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-2.5'
          >
            {children ?? <InspectorEmpty message='Nothing to show yet.' />}
          </div>
        </div>
      )}
    </EntitySidebarShell>
  );
}
