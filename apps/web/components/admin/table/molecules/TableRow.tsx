import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableRowProps {
  children: React.ReactNode;
  selected?: boolean;
  checked?: boolean;
  onClick?: () => void;
  virtualRow?: { start: number }; // For virtualization positioning
  className?: string;
  rowRef?: React.RefCallback<HTMLTableRowElement>;
  dataIndex?: number;
  style?: React.CSSProperties;
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
}: TableRowProps) {
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
        checked
          ? 'bg-[#ebebf6] dark:bg-[#1b1d38]'
          : selected
            ? 'bg-base dark:bg-surface-2'
            : 'hover:bg-base dark:hover:bg-surface-2',
        // Clickable cursor
        onClick && 'cursor-pointer',
        // Remove focus outline for clickable rows
        onClick && 'focus:outline-none',
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
