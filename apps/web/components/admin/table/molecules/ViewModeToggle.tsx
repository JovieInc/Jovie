'use client';

import { LayoutGrid, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'list' | 'board';

export interface ViewModeToggleProps {
  /**
   * Current view mode
   */
  viewMode: ViewMode;
  /**
   * Callback when view mode changes
   */
  onViewModeChange: (mode: ViewMode) => void;
  /**
   * Additional class names
   */
  className?: string;
}

/**
 * ViewModeToggle - Sliding toggle for list/board view modes
 *
 * A compact toggle control that switches between list and board views.
 * Features a sliding background indicator that animates between states.
 *
 * @example
 * ```tsx
 * <ViewModeToggle
 *   viewMode={viewMode}
 *   onViewModeChange={setViewMode}
 * />
 * ```
 */
export function ViewModeToggle({
  viewMode,
  onViewModeChange,
  className,
}: ViewModeToggleProps) {
  return (
    <fieldset
      className={cn(
        'relative inline-flex items-center rounded-lg border border-subtle bg-surface-1 p-0.5',
        className
      )}
      aria-label='View mode toggle'
    >
      {/* Sliding background indicator */}
      <div
        className={cn(
          'absolute inset-y-0.5 w-[calc(50%-2px)] rounded-md bg-surface-2 shadow-sm transition-all duration-200 ease-out',
          viewMode === 'list' ? 'left-0.5' : 'left-[calc(50%+0.5px)]'
        )}
        aria-hidden='true'
      />

      {/* List button */}
      <button
        type='button'
        onClick={() => onViewModeChange('list')}
        className={cn(
          'relative z-10 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
          viewMode === 'list'
            ? 'text-primary-token'
            : 'text-tertiary-token hover:text-secondary-token'
        )}
        aria-pressed={viewMode === 'list'}
        aria-label='List view'
      >
        <LayoutList className='h-4 w-4' />
      </button>

      {/* Board button */}
      <button
        type='button'
        onClick={() => onViewModeChange('board')}
        className={cn(
          'relative z-10 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
          viewMode === 'board'
            ? 'text-primary-token'
            : 'text-tertiary-token hover:text-secondary-token'
        )}
        aria-pressed={viewMode === 'board'}
        aria-label='Board view'
      >
        <LayoutGrid className='h-4 w-4' />
      </button>
    </fieldset>
  );
}
