'use client';

import { cn } from '../table.styles';

interface ActionsCellProps
  extends Readonly<{
    /**
     * Action buttons (always visible on hover)
     */
    actions?: React.ReactNode;

    /**
     * Overflow menu (always visible on hover)
     */
    menu?: React.ReactNode;

    /**
     * Whether the menu is currently open
     */
    isMenuOpen?: boolean;

    /**
     * Additional CSS classes
     */
    className?: string;
  }> {}

/**
 * ActionsCell - Icon button actions and overflow menu
 *
 * Features:
 * - Action buttons (refresh, verify, etc.)
 * - Overflow menu for more actions
 * - Fade in on row hover
 * - Always visible when menu is open
 * - Perfect vertical alignment
 *
 * Example:
 * ```tsx
 * <ActionsCell
 *   actions={
 *     <TableRowActions
 *       isVerified={profile.isVerified}
 *       onToggleVerification={handleVerification}
 *       onRefreshIngest={handleRefresh}
 *     />
 *   }
 *   menu={
 *     <CreatorActionsMenu
 *       profile={profile}
 *       onDelete={handleDelete}
 *     />
 *   }
 *   isMenuOpen={menuOpen}
 * />
 * ```
 */
export function ActionsCell({
  actions,
  menu,
  isMenuOpen = false,
  className,
}: ActionsCellProps) {
  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      {/* Icon action buttons - always visible on hover */}
      {actions && (
        <div
          className={cn(
            'opacity-0 pointer-events-none transition-opacity',
            'group-hover:opacity-100 group-hover:pointer-events-auto',
            'focus-within:opacity-100 focus-within:pointer-events-auto',
            isMenuOpen && 'opacity-100 pointer-events-auto'
          )}
        >
          {actions}
        </div>
      )}

      {/* Overflow menu - always visible on hover */}
      {menu && (
        <div
          className={cn(
            'opacity-0 pointer-events-none transition-opacity',
            'group-hover:opacity-100 group-hover:pointer-events-auto',
            'focus-within:opacity-100 focus-within:pointer-events-auto',
            isMenuOpen && 'opacity-100 pointer-events-auto'
          )}
        >
          {menu}
        </div>
      )}
    </div>
  );
}
