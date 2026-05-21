'use client';

import type * as React from 'react';
import { useMemo } from 'react';
import { rowState } from '@/components/organisms/table/table.styles';
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

  const combinedStyle = useMemo<React.CSSProperties>(
    () => ({
      ...customStyle,
      ...(isVirtual
        ? {
            transform: `translateY(${virtualRow?.start}px)`,
            height: '60px',
          }
        : {}),
    }),
    [customStyle, isVirtual, virtualRow?.start]
  );

  return (
    <tr
      ref={rowRef}
      data-index={dataIndex}
      className={cn(
        // Base styles
        'group border-b border-subtle transition-[background-color,box-shadow] duration-subtle last:border-b-0',
        // Fixed height to prevent layout shift
        'h-[60px]',
        // Hover and selected states — aligned with Linear design tokens
        (() => {
          if (checked) return rowState.checked;
          if (selected) return rowState.selected;
          return rowState.hover;
        })(),
        // Clickable cursor
        onClick && 'cursor-pointer',
        // Remove focus outline for clickable rows
        onClick && rowState.focusVisible,
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
