'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
  children,
  className,
}: DrawerLinkSectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Section header: title + action buttons */}
      <div className='flex items-center justify-between'>
        <h4
          className={[
            'text-[11px] font-semibold uppercase',
            'tracking-wide text-tertiary-token',
          ].join(' ')}
        >
          {title}
        </h4>
        <div className='flex items-center gap-0.5'>
          {headerActions}
          {onAdd && (
            <button
              type='button'
              onClick={onAdd}
              className={[
                'p-1 rounded-md text-tertiary-token',
                'hover:text-primary-token hover:bg-surface-2',
                'transition-colors',
              ].join(' ')}
              aria-label={addLabel}
            >
              <Plus className='h-4 w-4' />
            </button>
          )}
        </div>
      </div>

      {/* Link items — full-bleed on mobile (no rounded corners) */}
      {isEmpty ? (
        <p className='text-xs text-tertiary-token py-2'>{emptyMessage}</p>
      ) : (
        <div className='-mx-3 lg:mx-0'>{children}</div>
      )}
    </div>
  );
}
