import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableRowProps {
  readonly children: React.ReactNode;
  /** Whether the row is in a selected state (e.g., single-row focus/navigation). Only one row can be selected at a time. */
  readonly selected?: boolean;
  /** Whether the row is checked (e.g., multi-select checkbox). Multiple rows can be checked simultaneously. */
  readonly checked?: boolean;
  readonly onClick?: () => void;
  readonly virtualRow?: { readonly start: number }; // For virtualization positioning
  readonly className?: string;
  readonly rowRef?: React.RefCallback<HTMLTableRowElement>;
  readonly dataIndex?: number;
  readonly style?: React.CSSProperties;
}

export function TableRow({
  children,
  selected = false,
  checked = false,
  onClick,
  virtualRow,
  className,
  rowRef,
  dataIndex,
  style: customStyle,
}: Readonly<TableRowProps>) {
  const isVirtual = virtualRow !== undefined;

  const combinedStyle: React.CSSProperties = {
    ...customStyle,
    ...(isVirtual
      ? {
          transform: `translateY(${virtualRow.start}px)`,
          height: '60px',
        }
      : {}),
  };

  return (
    <tr
      ref={rowRef}
      data-index={dataIndex}
      className={cn(
        // Base styles
        'group transition-colors duration-200 border-b border-subtle last:border-b-0',
        // Fixed height to prevent layout shift
        'h-[60px]',
        // Hover and selected states matching creator table
        (() => {
          if (checked) return 'bg-[#ebebf6] dark:bg-[#1b1d38]';
          if (selected) return 'bg-base dark:bg-surface-2';
          return 'hover:bg-base dark:hover:bg-surface-2';
        })(),
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
      style={combinedStyle}
      aria-selected={selected}
    >
      {children}
    </tr>
  );
}
