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
        'group transition-colors',
        // Fixed height to prevent layout shift
        'h-[60px]',
        // Hover state - uses design token for consistent dark/light mode
        'hover:bg-(--color-cell-hover)',
        // Selected state
        selected && 'bg-surface-2/50',
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
              height: '60px',
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}
