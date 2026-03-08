'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import type { ReactNode } from 'react';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { DrawerEmptyState } from './DrawerEmptyState';
import { DrawerHeader } from './DrawerHeader';

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
      <div className='flex h-full flex-col'>
        {/* Header bar — close is in the overflow dropdown */}
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

        {isEmpty ? (
          /* Empty state */
          <div className='flex-1 overflow-auto px-5 py-5'>
            <DrawerEmptyState message={emptyMessage} />
          </div>
        ) : (
          <>
            {/* Entity header — image + name area */}
            {entityHeader && (
              <div className='shrink-0 border-b border-subtle/80 px-5 pt-4 pb-5 min-h-[88px]'>
                {entityHeader}
              </div>
            )}

            {/* Tabs */}
            {tabs && (
              <div className='shrink-0 border-b border-subtle/80 px-5 py-2.5 [&>*]:w-full'>
                {tabs}
              </div>
            )}

            {/* Scrollable content */}
            <div className='flex-1 min-h-0 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5'>
              {children}
            </div>

            {/* Footer */}
            {footer && <div className='shrink-0 px-5 py-3'>{footer}</div>}
          </>
        )}
      </div>
    </RightDrawer>
  );
}
