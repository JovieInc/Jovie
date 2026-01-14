'use client';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { LayoutGrid, LayoutList, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ViewMode = 'list' | 'board';
export type Density = 'compact' | 'normal' | 'comfortable';

export interface ColumnVisibility {
  [columnId: string]: boolean;
}

export interface DisplayMenuDropdownProps {
  /**
   * Trigger element (usually a button)
   */
  trigger?: ReactNode;
  /**
   * Current view mode
   */
  viewMode?: ViewMode;
  /**
   * Available view modes for this table
   */
  availableViewModes?: ViewMode[];
  /**
   * Callback when view mode changes
   */
  onViewModeChange?: (mode: ViewMode) => void;
  /**
   * Current density setting
   */
  density?: Density;
  /**
   * Callback when density changes
   */
  onDensityChange?: (density: Density) => void;
  /**
   * Current column visibility state
   */
  columnVisibility?: ColumnVisibility;
  /**
   * Callback when column visibility changes
   */
  onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;
  /**
   * Available columns to toggle
   */
  availableColumns?: Array<{ id: string; label: string }>;
  /**
   * Whether grouping is enabled
   */
  groupingEnabled?: boolean;
  /**
   * Callback when grouping toggle changes
   */
  onGroupingToggle?: (enabled: boolean) => void;
  /**
   * Label for grouping toggle (e.g., "Group by status")
   */
  groupingLabel?: string;
}

/**
 * DisplayMenuDropdown - Table display settings dropdown
 *
 * Provides a dropdown menu for controlling table display settings:
 * - View mode (List / Board)
 * - Column visibility toggles
 * - Density control (compact / normal / comfortable)
 * - Grouping toggle
 *
 * @example
 * ```tsx
 * <DisplayMenuDropdown
 *   viewMode={viewMode}
 *   availableViewModes={['list', 'board']}
 *   onViewModeChange={setViewMode}
 *   groupingEnabled={groupingEnabled}
 *   onGroupingToggle={setGroupingEnabled}
 *   groupingLabel="Group by status"
 *   availableColumns={[
 *     { id: 'email', label: 'Email' },
 *     { id: 'phone', label: 'Phone' },
 *   ]}
 *   columnVisibility={columnVisibility}
 *   onColumnVisibilityChange={handleColumnVisibilityChange}
 * />
 * ```
 */
export function DisplayMenuDropdown({
  trigger,
  viewMode,
  availableViewModes = ['list'],
  onViewModeChange,
  density,
  onDensityChange,
  columnVisibility,
  onColumnVisibilityChange,
  availableColumns = [],
  groupingEnabled = false,
  onGroupingToggle,
  groupingLabel = 'Group rows',
}: DisplayMenuDropdownProps) {
  const hasViewModeOptions = availableViewModes.length > 1 && onViewModeChange;
  const hasDensityOptions = onDensityChange;
  const hasColumnOptions =
    availableColumns.length > 0 && onColumnVisibilityChange;
  const hasGroupingOption = onGroupingToggle;

  const defaultTrigger = (
    <button
      type='button'
      className='inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-base hover:text-primary-token'
    >
      <Settings2 className='h-4 w-4' />
      Display
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        {/* View Mode Section */}
        {hasViewModeOptions && (
          <>
            <DropdownMenuLabel>View mode</DropdownMenuLabel>
            <div className='px-2 py-2'>
              {/* Sliding toggle for list/board */}
              <fieldset
                className='relative inline-flex w-full items-center rounded-lg border border-subtle bg-surface-1 p-0.5'
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
                  onClick={() => onViewModeChange?.('list')}
                  className={cn(
                    'relative z-10 inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                    viewMode === 'list'
                      ? 'text-primary-token'
                      : 'text-tertiary-token hover:text-secondary-token'
                  )}
                  aria-pressed={viewMode === 'list'}
                  aria-label='List view'
                >
                  <LayoutList className='h-4 w-4' />
                  <span>List</span>
                </button>

                {/* Board button */}
                <button
                  type='button'
                  onClick={() => onViewModeChange?.('board')}
                  className={cn(
                    'relative z-10 inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                    viewMode === 'board'
                      ? 'text-primary-token'
                      : 'text-tertiary-token hover:text-secondary-token'
                  )}
                  aria-pressed={viewMode === 'board'}
                  aria-label='Board view'
                >
                  <LayoutGrid className='h-4 w-4' />
                  <span>Board</span>
                </button>
              </fieldset>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Grouping Section */}
        {hasGroupingOption && (
          <>
            <DropdownMenuLabel>Display options</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuCheckboxItem
                checked={groupingEnabled}
                onCheckedChange={onGroupingToggle}
              >
                {groupingLabel}
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Column Visibility Section */}
        {hasColumnOptions && (
          <>
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <DropdownMenuGroup>
              {availableColumns.map(column => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={columnVisibility?.[column.id] ?? true}
                  onCheckedChange={(checked: boolean) =>
                    onColumnVisibilityChange?.(column.id, checked)
                  }
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Density Section */}
        {hasDensityOptions && (
          <>
            <DropdownMenuLabel>Density</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={density}
                onValueChange={(value: string) =>
                  onDensityChange?.(value as Density)
                }
              >
                <DropdownMenuRadioItem value='compact'>
                  Compact
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='normal'>
                  Normal
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='comfortable'>
                  Comfortable
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
