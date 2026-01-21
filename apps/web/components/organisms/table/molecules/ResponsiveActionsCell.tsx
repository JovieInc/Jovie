'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { MoreVertical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Breakpoint thresholds for responsive behavior */
const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
} as const;

/** Max inline actions per breakpoint */
const MAX_INLINE_ACTIONS = {
  mobile: 0,
  tablet: 1,
  desktop: 2,
} as const;

export interface Action {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ResponsiveActionsCellProps {
  /**
   * All available actions
   */
  actions: Action[];
  /**
   * IDs of actions to show inline on desktop (others go in overflow menu)
   * Default: show first 2 actions inline
   */
  primaryActionIds?: string[];
  /**
   * Custom className for the cell container
   */
  className?: string;
}

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/**
 * ResponsiveActionsCell - Responsive action buttons with progressive disclosure
 *
 * Adapts action button visibility based on viewport size:
 * - Desktop (1024px+): All primary actions visible inline, rest in overflow menu
 * - Tablet (768-1023px): First 1-2 actions visible inline, rest in overflow menu
 * - Mobile (<768px): All actions in overflow menu only
 *
 * Features:
 * - Automatic breakpoint detection with useEffect
 * - Overflow menu for additional actions
 * - Icon support for all actions
 * - Destructive action styling
 * - Disabled state handling
 *
 * @example
 * ```tsx
 * <ResponsiveActionsCell
 *   actions={[
 *     { id: 'edit', label: 'Edit', icon: <PencilIcon />, onClick: handleEdit },
 *     { id: 'copy', label: 'Copy', icon: <CopyIcon />, onClick: handleCopy },
 *     { id: 'delete', label: 'Delete', destructive: true, onClick: handleDelete },
 *   ]}
 *   primaryActionIds={['edit', 'copy']}
 * />
 * ```
 */
export function ResponsiveActionsCell({
  actions,
  primaryActionIds,
  className,
}: ResponsiveActionsCellProps) {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINTS.MOBILE) {
        setBreakpoint('mobile');
      } else if (width < BREAKPOINTS.TABLET) {
        setBreakpoint('tablet');
      } else {
        setBreakpoint('desktop');
      }
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  // Determine which actions to show inline vs overflow
  const maxInline = MAX_INLINE_ACTIONS[breakpoint];

  const primaryActions = primaryActionIds
    ? actions.filter(a => primaryActionIds.includes(a.id))
    : actions.slice(0, maxInline);

  const overflowActions = primaryActionIds
    ? actions.filter(a => !primaryActionIds.includes(a.id))
    : actions.slice(maxInline);

  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      {/* Inline actions (hidden on mobile) */}
      {primaryActions.map(action => (
        <button
          key={action.id}
          type='button'
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out',
            action.destructive
              ? 'text-destructive hover:text-destructive hover:bg-destructive/10 [&_svg]:text-destructive'
              : 'text-secondary-token hover:bg-surface-2 hover:text-primary-token',
            action.disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {action.icon && (
            <span className='h-4 w-4 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4'>
              {action.icon}
            </span>
          )}
          <span className='hidden sm:inline'>{action.label}</span>
        </button>
      ))}

      {/* Overflow menu */}
      {overflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className='inline-flex items-center justify-center rounded-full h-8 w-8 border border-subtle bg-transparent text-tertiary-token transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
              aria-label='More actions'
            >
              <MoreVertical className='h-4 w-4' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {overflowActions.map((action, index) => (
              <div key={action.id}>
                {index > 0 &&
                  overflowActions[index - 1]?.destructive !==
                    action.destructive && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={action.onClick}
                  disabled={action.disabled}
                  variant={action.destructive ? 'destructive' : 'default'}
                >
                  {action.icon && (
                    <span className='h-4 w-4 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4'>
                      {action.icon}
                    </span>
                  )}
                  {action.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
