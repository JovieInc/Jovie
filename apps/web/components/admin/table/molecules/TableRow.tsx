import { cn } from '@/lib/utils';

export interface TableRowProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  virtualRow?: { start: number }; // For virtualization positioning
  className?: string;
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
        // Hover state
        'hover:bg-surface-2',
        // Selected state
        selected && 'bg-surface-2/50',
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
      style={
        isVirtual
          ? {
              transform: `translateY(${virtualRow.start}px)`,
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}
