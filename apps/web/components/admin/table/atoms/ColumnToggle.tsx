'use client';

import { cn } from '@/lib/utils';

export interface ColumnToggleProps {
  /**
   * Column identifier
   */
  id: string;
  /**
   * Display label for the column
   */
  label: string;
  /**
   * Whether the column is currently visible
   */
  isVisible: boolean;
  /**
   * Whether this column can be toggled (false for required columns like "Creator")
   */
  canToggle?: boolean;
  /**
   * Callback when toggle state changes
   */
  onToggle: (id: string, visible: boolean) => void;
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
 * ColumnToggle - Linear.app style column visibility toggle button
 *
 * A pill-shaped toggle button for showing/hiding table columns.
 * When enabled (visible), the button has a filled background.
 * When disabled (hidden), the button has only a border.
 *
 * Accessibility:
 * - Uses button role with aria-pressed for toggle state
 * - Keyboard accessible (Enter/Space to toggle)
 * - Clear visual state indication
 *
 * @example
 * ```tsx
 * <ColumnToggle
 *   id="social"
 *   label="Social Links"
 *   isVisible={true}
 *   onToggle={(id, visible) => handleToggle(id, visible)}
 * />
 * ```
 */
export function ColumnToggle({
  id,
  label,
  isVisible,
  canToggle = true,
  onToggle,
  className,
  'data-testid': testId,
}: ColumnToggleProps) {
  const handleClick = () => {
    if (canToggle) {
      onToggle(id, !isVisible);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && canToggle) {
      event.preventDefault();
      onToggle(id, !isVisible);
    }
  };

  return (
    <button
      type='button'
      role='switch'
      aria-checked={isVisible}
      aria-label={`${isVisible ? 'Hide' : 'Show'} ${label} column`}
      disabled={!canToggle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid={testId ?? `column-toggle-${id}`}
      className={cn(
        // Base styles
        'inline-flex items-center justify-center',
        'px-3 py-1.5',
        'text-sm font-medium',
        'rounded-md',
        'border',
        'transition-all duration-150 ease-in-out',
        'select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // State-based styles
        isVisible
          ? [
              // Enabled/visible state - filled background
              'bg-surface-2 dark:bg-surface-2',
              'border-border-subtle',
              'text-primary-token',
            ]
          : [
              // Disabled/hidden state - just border
              'bg-transparent',
              'border-border-subtle',
              'text-tertiary-token',
            ],
        // Interactive states (only if toggleable)
        canToggle
          ? [
              'cursor-pointer',
              'hover:bg-surface-1 dark:hover:bg-surface-1',
              'hover:text-primary-token',
              'active:scale-95',
            ]
          : ['cursor-not-allowed', 'opacity-60'],
        className
      )}
    >
      {label}
    </button>
  );
}
