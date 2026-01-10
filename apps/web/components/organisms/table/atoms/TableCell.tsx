import { cn } from '@/lib/utils';

export interface TableCellProps {
  children: React.ReactNode;
  width?: string; // e.g., 'w-14', 'w-[260px]'
  align?: 'left' | 'center' | 'right';
  className?: string;
  hideOnMobile?: boolean;
  as?: 'td' | 'th';
}

export function TableCell({
  children,
  width,
  align = 'left',
  className,
  hideOnMobile = false,
  as: Component = 'td',
}: TableCellProps) {
  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <Component
      className={cn(
        // Base styles with line-clamp instead of truncate
        'px-4 py-3 border-b border-subtle text-[13px] text-secondary-token',
        'line-clamp-1 overflow-hidden text-ellipsis',
        // Width
        width,
        // Alignment
        alignmentClasses[align],
        // Responsive hiding
        hideOnMobile && 'hidden md:table-cell',
        // Custom classes
        className
      )}
    >
      {children}
    </Component>
  );
}
