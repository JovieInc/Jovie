'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import type { ReactNode } from 'react';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import { DrawerEmptyState } from './DrawerEmptyState';
import { DrawerHeader } from './DrawerHeader';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface EntitySidebarShellProps {
  /** Whether the sidebar drawer is open */
  readonly isOpen: boolean;
  /** Drawer width — defaults to SIDEBAR_WIDTH */
  readonly width?: number;
  /** Accessible label for the drawer landmark */
  readonly ariaLabel: string;
  /** Keyboard handler forwarded to RightDrawer */
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  /** Context menu items for right-click */
  readonly contextMenuItems?: CommonDropdownItem[];
  /** Test ID for the drawer */
  readonly 'data-testid'?: string;

  /** Header title — string or ReactNode */
  readonly title?: ReactNode;
  /** Close handler — renders close button in header */
  readonly onClose?: () => void;
  /** Action buttons rendered in the header (before close button) */
  readonly headerActions?: ReactNode;
  /** Minimal mode keeps top chrome utility-only and moves entity header into scrollable content. */
  readonly headerMode?: 'standard' | 'minimal';
  /** Hide the utility-only top bar in minimal mode. */
  readonly hideMinimalHeaderBar?: boolean;

  /**
   * Persistent pre-tab region — pinned above tabs in standard mode and above the
   * scrollable region in minimal mode. Can accept a fragment with multiple
   * elements (e.g., entity card + analytics) — they stack with space-y-2.
   */
  readonly entityHeader?: ReactNode;
  /** When true, header actions render inside the entity header card instead of the title bar */
  readonly actionsInEntityHeader?: boolean;
  /** Tabs slot — SegmentControl rendered below entity header in standard mode */
  readonly tabs?: ReactNode;
  /** Controls where tabs render when headerMode is minimal. */
  readonly minimalTabsPlacement?: 'card' | 'header';
  /** Optional className override for the tabs wrapper */
  readonly tabsContainerClassName?: string;

  /** Main scrollable content */
  readonly children: ReactNode;

  /** Footer slot — pinned to bottom of drawer */
  readonly footer?: ReactNode;

  /** When true, shows empty state instead of entityHeader + tabs + children */
  readonly isEmpty?: boolean;
  /** Message shown in empty state */
  readonly emptyMessage?: string;
}

/**
 * Unified shell for entity detail sidebars.
 *
 * Provides a consistent layout across Release, Contact, Audience,
 * Profile, and other detail sidebars with standardized spacing
 * and scroll behavior.
 *
 * Standard layout rule: persistent content → tabs → tab content.
 * In minimal mode, the entity header stays pinned above the scrollable region,
 * while callers compose tab controls into the main content card.
 * Only tab-specific children scroll.
 *
 *  ┌─────────────────────────┐
 *  │ DrawerHeader (title +   │  shrink-0
 *  │ actions + close)        │
 *  ├─────────────────────────┤
 *  │ Entity header (image +  │  shrink-0  (optional, pinned)
 *  ├─────────────────────────┤
 *  │ Scrollable content      │  flex-1 overflow
 *  │                         │
 *  ├─────────────────────────┤
 *  │ Footer                  │  shrink-0  (optional)
 *  └─────────────────────────┘
 */
export function EntitySidebarShell({
  isOpen,
  width = SIDEBAR_WIDTH,
  ariaLabel,
  onKeyDown,
  contextMenuItems,
  'data-testid': testId,
  title,
  onClose,
  headerActions,
  headerMode = 'standard',
  hideMinimalHeaderBar = false,
  entityHeader,
  actionsInEntityHeader = false,
  tabs,
  minimalTabsPlacement = 'card',
  tabsContainerClassName,
  children,
  footer,
  isEmpty = false,
  emptyMessage = 'Select an item to view details.',
}: EntitySidebarShellProps) {
  const isMinimalHeader = headerMode === 'minimal';
  const showMinimalHeaderBar = !(isMinimalHeader && hideMinimalHeaderBar);
  const renderMinimalTabsInHeader =
    isMinimalHeader && minimalTabsPlacement === 'header';
  const resolvedHeaderTitle = isMinimalHeader
    ? (title ?? <span className='sr-only'>{ariaLabel}</span>)
    : title;
  const closeAction = onClose ? (
    <DrawerHeaderActions
      primaryActions={[]}
      overflowActions={[]}
      onClose={onClose}
    />
  ) : undefined;
  const titleBarActions = actionsInEntityHeader
    ? closeAction
    : (headerActions ?? closeAction);
  return (
    <RightDrawer
      isOpen={isOpen}
      width={width}
      ariaLabel={ariaLabel}
      onKeyDown={onKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid={testId}
    >
      <div className='flex h-full min-h-0 flex-col gap-0.5 px-1.5 py-1.5 lg:px-0 lg:py-0'>
        <div className='shrink-0 space-y-0.5'>
          <DrawerSurfaceCard
            variant='card'
            className='overflow-hidden lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none'
          >
            <div
              className={cn(
                'border-b border-transparent bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,transparent)] backdrop-blur-[12px]'
              )}
            >
              {showMinimalHeaderBar ? (
                <DrawerHeader
                  title={resolvedHeaderTitle}
                  actions={titleBarActions}
                  className={cn(
                    isMinimalHeader &&
                      'min-h-[34px] px-2.5 py-1 lg:min-h-[36px] lg:px-3'
                  )}
                />
              ) : null}

              {!isMinimalHeader && entityHeader ? (
                <div className='overflow-visible px-3 pb-2.5 pt-2.5'>
                  {actionsInEntityHeader && headerActions ? (
                    <div className='mb-2 flex items-center justify-end gap-1'>
                      {headerActions}
                    </div>
                  ) : null}
                  {entityHeader}
                </div>
              ) : null}

              {!isMinimalHeader && tabs ? (
                <div
                  className={cn(
                    'overflow-visible border-t border-(--linear-app-frame-seam) px-3 py-2 [&>*]:w-full',
                    tabsContainerClassName
                  )}
                >
                  {tabs}
                </div>
              ) : null}

              {renderMinimalTabsInHeader && tabs ? (
                <div
                  className={cn(
                    showMinimalHeaderBar &&
                      'border-t border-(--linear-app-frame-seam)',
                    'overflow-visible px-3 py-2 [&>*]:w-full',
                    tabsContainerClassName
                  )}
                >
                  {tabs}
                </div>
              ) : null}
            </div>
          </DrawerSurfaceCard>

          {isMinimalHeader && !isEmpty && entityHeader ? (
            <DrawerSurfaceCard
              testId='entity-sidebar-entity-header'
              variant='card'
              className='overflow-hidden lg:mx-1.5'
            >
              {entityHeader}
            </DrawerSurfaceCard>
          ) : null}
        </div>

        {isEmpty ? (
          <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain lg:px-1.5'>
            <DrawerSurfaceCard variant='card' className='p-4'>
              <DrawerEmptyState message={emptyMessage} />
            </DrawerSurfaceCard>
          </div>
        ) : (
          <>
            <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain lg:px-1.5'>
              <div className='space-y-0.5'>{children}</div>
            </div>

            {footer ? (
              <DrawerSurfaceCard variant='card' className='shrink-0 px-3 py-2'>
                {footer}
              </DrawerSurfaceCard>
            ) : null}
          </>
        )}
      </div>
    </RightDrawer>
  );
}
