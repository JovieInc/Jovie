'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import type { ReactNode } from 'react';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
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
  readonly title: ReactNode;
  /** Close handler — renders close button in header */
  readonly onClose?: () => void;
  /** Action buttons rendered in the header (before close button) */
  readonly headerActions?: ReactNode;

  /** Entity header slot — image + name area below the header bar */
  readonly entityHeader?: ReactNode;
  /** Tabs slot — SegmentControl rendered below entity header */
  readonly tabs?: ReactNode;
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
 * Layout (top to bottom):
 *  ┌─────────────────────────┐
 *  │ DrawerHeader (title +   │  shrink-0
 *  │ actions + close)        │
 *  ├─────────────────────────┤
 *  │ Entity header (image +  │  shrink-0  (optional)
 *  │ name / metadata)        │
 *  ├─────────────────────────┤
 *  │ Tabs (SegmentControl)   │  shrink-0  (optional)
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
  entityHeader,
  tabs,
  tabsContainerClassName,
  children,
  footer,
  isEmpty = false,
  emptyMessage = 'Select an item to view details.',
}: EntitySidebarShellProps) {
  return (
    <RightDrawer
      isOpen={isOpen}
      width={width}
      ariaLabel={ariaLabel}
      onKeyDown={onKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid={testId}
    >
      <div className='flex h-full min-h-0 flex-col gap-2 px-1.5 py-1.5'>
        <div className='shrink-0'>
          <DrawerSurfaceCard variant='card' className='overflow-hidden'>
            <div
              className={cn(
                LINEAR_SURFACE.stickyHeader,
                'border-b border-transparent backdrop-blur-[12px]'
              )}
            >
              <DrawerHeader
                title={title}
                actions={
                  headerActions ??
                  (onClose ? (
                    <DrawerHeaderActions
                      primaryActions={[]}
                      overflowActions={[]}
                      onClose={onClose}
                    />
                  ) : undefined)
                }
              />

              {entityHeader ? (
                <div className='overflow-visible px-3 pb-2.5 pt-2.5'>
                  {entityHeader}
                </div>
              ) : null}

              {tabs ? (
                <div
                  className={cn(
                    'overflow-visible border-t border-(--linear-app-frame-seam) px-3 py-2 [&>*]:w-full',
                    tabsContainerClassName
                  )}
                >
                  {tabs}
                </div>
              ) : null}
            </div>
          </DrawerSurfaceCard>
        </div>

        {isEmpty ? (
          <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5'>
            <DrawerSurfaceCard variant='card' className='p-4'>
              <DrawerEmptyState message={emptyMessage} />
            </DrawerSurfaceCard>
          </div>
        ) : (
          <>
            <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5'>
              <div className='space-y-3'>{children}</div>
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
