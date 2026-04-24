'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { LayoutGrid, LayoutList, Settings2, X } from 'lucide-react';
import { memo, type ReactNode, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type ViewMode = 'list' | 'board';
export type Density = 'compact' | 'normal' | 'comfortable';

export interface ColumnVisibility {
  [columnId: string]: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

/** Inline toggle switch matching Linear's compact style */
function ToggleSwitch({
  label,
  checked,
  onToggle,
}: Readonly<{
  label: string;
  checked: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      onClick={onToggle}
      className='flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 transition-[background-color] duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
    >
      <span className='text-[13px] text-secondary-token'>{label}</span>
      <span
        className={cn(
          'flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-primary' : 'bg-surface-2'
        )}
      >
        <span
          className={cn(
            'h-3 w-3 rounded-full bg-white transition-transform',
            checked && 'translate-x-3'
          )}
        />
      </span>
    </button>
  );
}

interface ColumnToggleButtonProps {
  readonly columnId: string;
  readonly label: string;
  readonly isVisible: boolean;
  readonly onToggle: (columnId: string, visible: boolean) => void;
}

const ColumnToggleButton = memo(function ColumnToggleButton({
  columnId,
  label,
  isVisible,
  onToggle,
}: ColumnToggleButtonProps) {
  const handleClick = useCallback(() => {
    onToggle(columnId, !isVisible);
  }, [onToggle, columnId, isVisible]);

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-pressed={isVisible}
      aria-label={`${isVisible ? 'Hide' : 'Show'} ${label} column`}
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-[510] transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:bg-surface-1',
        isVisible
          ? 'bg-surface-1 text-secondary-token'
          : 'text-tertiary-token hover:bg-surface-1 hover:text-secondary-token'
      )}
    >
      {label}
    </button>
  );
});

/** Density option button */
const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'comfortable', label: 'Comfortable' },
];

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export interface DisplayMenuDropdownProps {
  readonly trigger?: ReactNode;
  readonly viewMode?: ViewMode;
  readonly availableViewModes?: ViewMode[];
  readonly onViewModeChange?: (mode: ViewMode) => void;
  readonly density?: Density;
  readonly onDensityChange?: (density: Density) => void;
  readonly columnVisibility?: ColumnVisibility;
  readonly onColumnVisibilityChange?: (
    columnId: string,
    visible: boolean
  ) => void;
  readonly availableColumns?: Array<{ id: string; label: string }>;
  readonly groupingEnabled?: boolean;
  readonly onGroupingToggle?: (enabled: boolean) => void;
  readonly groupingLabel?: string;
}

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
      className='inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-[13px] font-[510] text-secondary-token transition-[background-color,border-color,color] duration-150 hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
    >
      <Settings2 className='h-4 w-4' />
      Display
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger ?? defaultTrigger}</PopoverTrigger>
      <PopoverContent align='end' className='w-[280px]'>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className='flex items-center justify-between border-b border-subtle px-2.5 py-1.5'>
          <span className='text-[13px] font-semibold text-primary-token'>
            Display
          </span>
          <PopoverPrimitive.Close
            aria-label='Close'
            className='rounded-full border border-transparent p-0.5 text-tertiary-token transition-[background-color,border-color,color] duration-150 hover:border-subtle hover:bg-surface-1 hover:text-secondary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1'
          >
            <X className='h-4 w-4' />
          </PopoverPrimitive.Close>
        </div>

        {/* ── View Mode ──────────────────────────────────────────── */}
        {hasViewModeOptions && (
          <div className='border-b border-subtle px-2.5 py-1.5'>
            <fieldset
              className='relative inline-flex w-full items-center rounded bg-surface-1 p-0.5'
              aria-label='View mode toggle'
            >
              {/* Sliding background indicator */}
              <div
                className={cn(
                  'absolute inset-y-0.5 w-[calc(50%-2px)] rounded bg-surface-0 transition-all duration-200 ease-out',
                  viewMode === 'list' ? 'left-0.5' : 'left-[calc(50%+0.5px)]'
                )}
                aria-hidden='true'
              />

              <button
                type='button'
                onClick={() => onViewModeChange?.('list')}
                className={cn(
                  'relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-[510] transition-colors duration-150',
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

              <button
                type='button'
                onClick={() => onViewModeChange?.('board')}
                className={cn(
                  'relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-[510] transition-colors duration-150',
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
        )}

        {/* ── Grouping Toggle ────────────────────────────────────── */}
        {hasGroupingOption && (
          <div className='border-b border-subtle px-2.5 py-1'>
            <ToggleSwitch
              label={groupingLabel}
              checked={groupingEnabled}
              onToggle={() => onGroupingToggle(!groupingEnabled)}
            />
          </div>
        )}

        {/* ── Display Properties (Column Visibility) ─────────────── */}
        {hasColumnOptions && (
          <div
            className={cn(
              'px-2.5 py-1.5',
              hasDensityOptions && 'border-b border-subtle'
            )}
          >
            <p className='px-0.5 pb-1 text-[13px] font-[510] tracking-normal text-secondary-token'>
              Display properties
            </p>
            <div className='flex flex-wrap gap-1'>
              {availableColumns.map(column => (
                <ColumnToggleButton
                  key={column.id}
                  columnId={column.id}
                  label={column.label}
                  isVisible={columnVisibility?.[column.id] ?? true}
                  onToggle={onColumnVisibilityChange}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Density ────────────────────────────────────────────── */}
        {hasDensityOptions && (
          <div className='px-2.5 py-1.5'>
            <p className='px-0.5 pb-1 text-[13px] font-[510] tracking-normal text-secondary-token'>
              Density
            </p>
            <div className='grid grid-cols-3 gap-1'>
              {DENSITY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type='button'
                  onClick={() => onDensityChange?.(option.value)}
                  aria-pressed={density === option.value}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] font-[510] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                    density === option.value
                      ? 'bg-surface-2 text-primary-token'
                      : 'text-tertiary-token hover:bg-surface-1 hover:text-secondary-token'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
