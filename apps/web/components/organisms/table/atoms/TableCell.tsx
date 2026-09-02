import { cn } from '@jovie/ui/lib/utils';
import { borders, presets, tableAlignment } from '../table.styles';

export interface TableCellProps {
  readonly children: React.ReactNode;
  readonly width?: string; // e.g., 'w-14', 'w-65'
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
  return (
    <Component
      className={cn(
        borders.cell,
        presets.tableCell,
        'line-clamp-1 overflow-hidden text-ellipsis',
        // Width
        width,
        // Alignment
        tableAlignment.text[align],
        // Responsive hiding
        hideOnMobile && 'max-md:hidden md:table-cell',
        // Custom classes
        className
      )}
    >
      {children}
    </Component>
  );
}
