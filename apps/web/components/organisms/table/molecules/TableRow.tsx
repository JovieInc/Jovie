'use client';

import { cn } from '@/lib/utils';

export interface TableRowProps {
  readonly children: React.ReactNode;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly virtualRow?: { start: number }; // For virtualization positioning
  readonly className?: string;
}

export function TableRow({
  children,
  selected = false,
  onClick,
  virtualRow,
  className,
}: TableRowProps) {
  const isVirtual = virtualRow !== undefined;

  return (
    <tr
      className={cn(
        // Base styles
        'group transition-colors duration-150',
        // Fixed height to prevent layout shift
        'h-[32px]',
        // Hover state — Linear: rgba(255,255,255,0.02)
        'hover:bg-white/[0.02]',
        // Selected state — Linear: rgba(255,255,255,0.04)
        selected && 'bg-white/[0.04]',
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
      style={
        isVirtual
          ? {
              transform: `translateY(${virtualRow.start}px)`,
              height: '32px',
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}
