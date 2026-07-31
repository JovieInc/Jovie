'use client';

import { cn } from '../table.styles';

interface ActionsCellProps
  extends Readonly<{
    /** Action buttons revealed by the canonical row-context state. */
    readonly actions?: React.ReactNode;

    /** Overflow menu revealed by the canonical row-context state. */
    readonly menu?: React.ReactNode;

    /**
     * Whether the menu is currently open
     */
    readonly isMenuOpen?: boolean;

    /**
     * Additional CSS classes
     */
    readonly className?: string;
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
            'system-b-table-contextual-action',
            isMenuOpen && 'opacity-100 pointer-events-auto'
          )}
          data-menu-open={isMenuOpen || undefined}
        >
          {actions}
        </div>
      )}

      {/* Overflow menu - always visible on hover */}
      {menu && (
        <div
          className={cn(
            'system-b-table-contextual-action',
            isMenuOpen && 'opacity-100 pointer-events-auto'
          )}
          data-menu-open={isMenuOpen || undefined}
        >
          {menu}
        </div>
      )}
    </div>
  );
}
