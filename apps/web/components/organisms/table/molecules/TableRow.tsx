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
        // Fixed height to prevent layout shift
        'h-[60px]',
        // Hover state
        'hover:bg-surface-2',
        // Selected state
        selected && 'bg-surface-2/50',
        // Clickable cursor
        onClick && 'cursor-pointer',
        // Accessible focus state for clickable rows
        onClick && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        // Virtual positioning
        isVirtual && 'absolute left-0 right-0',
        // Custom classes
        className
      )}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
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
