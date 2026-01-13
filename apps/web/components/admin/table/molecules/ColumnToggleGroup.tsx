'use client';

import { cn } from '@/lib/utils';
import { ColumnToggle } from '../atoms/ColumnToggle';

export interface ColumnConfig {
  /**
   * Column identifier (matches TanStack Table column id)
   */
  id: string;
  /**
   * Display label for the column
   */
  label: string;
  /**
   * Whether this column is visible by default
   * @default true
   */
  defaultVisible?: boolean;
  /**
   * Whether this column can be toggled (false for required columns)
   * Required columns like "Creator" cannot be hidden
   * @default true
   */
  canToggle?: boolean;
}

export interface ColumnVisibilityState {
  [columnId: string]: boolean;
}

export interface ColumnToggleGroupProps {
  /**
   * Available columns configuration
   */
  columns: ColumnConfig[];
  /**
   * Current visibility state for each column
   */
  visibility: ColumnVisibilityState;
  /**
   * Callback when a column's visibility changes
   */
  onVisibilityChange: (columnId: string, visible: boolean) => void;
  /**
   * Optional label for the group (for accessibility)
   */
  label?: string;
  /**
   * Optional className for additional styling
   */
  className?: string;
  /**
   * Optional data-testid for testing
   */
  'data-testid'?: string;
}

/**
 * ColumnToggleGroup - Collection of Linear.app style column toggles
 *
 * Renders a row of pill-shaped toggle buttons for controlling table column visibility.
 * Each column can be configured as toggleable or required (always visible).
 *
 * Features:
 * - Horizontal scrollable layout for many columns
 * - Proper ARIA labeling for accessibility
 * - Visual grouping with consistent spacing
 *
 * @example
 * ```tsx
 * const columns: ColumnConfig[] = [
 *   { id: 'avatar', label: 'Creator', canToggle: false },
 *   { id: 'social', label: 'Social Links', defaultVisible: true },
 *   { id: 'created', label: 'Created', defaultVisible: true },
 *   { id: 'verified', label: 'Verified', defaultVisible: false },
 * ];
 *
 * <ColumnToggleGroup
 *   columns={columns}
 *   visibility={visibility}
 *   onVisibilityChange={handleVisibilityChange}
 * />
 * ```
 */
export function ColumnToggleGroup({
  columns,
  visibility,
  onVisibilityChange,
  label = 'Column visibility',
  className,
  'data-testid': testId,
}: ColumnToggleGroupProps) {
  // Filter to only show toggleable columns and required columns
  const displayColumns = columns.filter(
    col => col.canToggle !== false || !col.canToggle
  );

  return (
    <fieldset
      aria-label={label}
      data-testid={testId ?? 'column-toggle-group'}
      className={cn('flex flex-wrap gap-2 border-0 p-0 m-0', className)}
    >
      <legend className='sr-only'>{label}</legend>
      {displayColumns.map(column => {
        const isVisible =
          visibility[column.id] ?? column.defaultVisible ?? true;
        const canToggle = column.canToggle ?? true;

        return (
          <ColumnToggle
            key={column.id}
            id={column.id}
            label={column.label}
            isVisible={isVisible}
            canToggle={canToggle}
            onToggle={onVisibilityChange}
          />
        );
      })}
    </fieldset>
  );
}

/**
 * Helper function to create initial visibility state from column config
 */
export function createInitialVisibility(
  columns: ColumnConfig[]
): ColumnVisibilityState {
  return columns.reduce<ColumnVisibilityState>((acc, column) => {
    // Required columns (canToggle: false) are always visible
    if (column.canToggle === false) {
      acc[column.id] = true;
    } else {
      acc[column.id] = column.defaultVisible ?? true;
    }
    return acc;
  }, {});
}
