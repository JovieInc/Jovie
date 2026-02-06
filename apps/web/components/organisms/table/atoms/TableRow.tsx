'use client';

import { cn } from '@/lib/utils';

export interface TableRowProps {
  readonly children: React.ReactNode;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly virtualRow?: { start: number }; // For virtualization positioning
  readonly className?: string;
  // Keyboard navigation props
  readonly keyboardFocused?: boolean;
  readonly onKeyDown?: (e: React.KeyboardEvent) => void;
  readonly rowIndex?: number;
}

/**
 * Enhanced table row component with keyboard navigation support
 *
 * Features:
 * - Fixed 60px height to prevent layout shift
 * - Keyboard focus ring when focused via keyboard
 * - Virtual positioning for large datasets
 * - Accessible ARIA attributes
 *
 * @example
 * ```tsx
 * <TableRow
 *   selected={isSelected}
 *   keyboardFocused={focusedIndex === rowIndex}
 *   onKeyDown={handleKeyDown}
 *   rowIndex={index}
 *   onClick={() => handleRowClick(row)}
 * >
 *   <TableCell>Content</TableCell>
 * </TableRow>
 * ```
 */
export function TableRow({
  children,
  selected = false,
  onClick,
  virtualRow,
  className,
  keyboardFocused = false,
  onKeyDown,
  rowIndex,
}: TableRowProps) {
  const isVirtual = virtualRow !== undefined;

  return (
    <tr
      data-row-index={rowIndex}
      className={cn(
        // Base styles
        'group transition-colors',
        // Fixed height to prevent layout shift
        'h-[60px]',
        // Hover state - uses design token for consistent dark/light mode
        'hover:bg-(--color-cell-hover)',
        // Selected state
        selected && 'bg-surface-2/70',
        // Keyboard focus state — subtle bg highlight, no ring (Linear-style)
        keyboardFocused && 'bg-surface-2/50',
        // Clickable cursor
        onClick && 'cursor-pointer',
        // Remove focus outline for clickable rows
        onClick && 'focus-visible:outline-none',
        // Virtual positioning
        isVirtual && 'absolute left-0 right-0',
        // Custom classes
        className
      )}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={keyboardFocused ? 0 : -1}
      aria-selected={selected}
      style={
        isVirtual
          ? {
              transform: `translateY(${virtualRow.start}px)`,
              height: '60px',
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}
