'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerEmptyState } from './DrawerEmptyState';
import { DrawerSectionHeading } from './DrawerSectionHeading';

export const DRAWER_LINK_SECTION_ICON_BUTTON_CLASSNAME =
  'min-h-[40px] min-w-[40px] flex items-center justify-center rounded-[7px] border border-transparent text-(--linear-text-tertiary) transition-[background-color,border-color,color,box-shadow] duration-150 active:bg-(--linear-bg-surface-1) hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) lg:min-h-0 lg:min-w-0 lg:p-1.5 lg:active:bg-transparent';

export interface DrawerLinkSectionProps {
  /** Section heading text */
  readonly title: string;
  /** Callback to add a new link — renders a + button in the header */
  readonly onAdd?: () => void;
  /** Accessible label for the add button */
  readonly addLabel?: string;
  /** Extra action buttons rendered alongside the add button */
  readonly headerActions?: ReactNode;
  /** Message shown when there are no links */
  readonly emptyMessage?: string;
  /** Whether the section has no links */
  readonly isEmpty?: boolean;
  /** Stable selector for the empty state container */
  readonly emptyStateTestId?: string;
  /** The link list items */
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Shared section wrapper for link lists across all right-drawer sidebars.
 *
 * Provides a consistent header with title + action menu (add button),
 * full-width mobile styling, and empty state.
 *
 * Used by: ProfileLinkList, ReleaseDspLinks, ContactSocialLinks
 */
export function DrawerLinkSection({
  title,
  onAdd,
  addLabel = 'Add link',
  headerActions,
  emptyMessage = 'No links yet.',
  isEmpty = false,
  emptyStateTestId,
  children,
  className,
}: DrawerLinkSectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Section header: title + action buttons */}
      <div className='flex min-h-[40px] items-center justify-between gap-2 lg:min-h-0'>
        <DrawerSectionHeading
          as='h4'
          className='min-w-0 flex-1 truncate text-[11px] tracking-[0.08em]'
        >
          {title}
        </DrawerSectionHeading>
        <div className='flex shrink-0 items-center gap-1 lg:gap-0.5'>
          {headerActions}
          {onAdd && (
            <button
              type='button'
              onClick={onAdd}
              className={DRAWER_LINK_SECTION_ICON_BUTTON_CLASSNAME}
              aria-label={addLabel}
            >
              <Plus className='h-4 w-4' />
            </button>
          )}
        </div>
      </div>

      {/* Link items — full-bleed on mobile (no rounded corners) */}
      {isEmpty ? (
        <DrawerEmptyState
          message={emptyMessage}
          className='min-h-[96px]'
          testId={emptyStateTestId}
        />
      ) : (
        <div className='-mx-5 lg:mx-0'>{children}</div>
      )}
    </div>
  );
}
