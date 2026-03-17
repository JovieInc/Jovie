import { cn } from '@/lib/utils';

export interface TableCellProps {
  readonly children: React.ReactNode;
  readonly width?: string; // e.g., 'w-14', 'w-[260px]'
  readonly align?: 'left' | 'center' | 'right';
  readonly className?: string;
  readonly hideOnMobile?: boolean;
  readonly as?: 'td' | 'th';
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
        'border-b border-subtle px-4 py-2 text-[13px] leading-[1.35] text-secondary-token',
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
