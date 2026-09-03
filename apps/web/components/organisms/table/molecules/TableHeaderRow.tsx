import { cn } from '@/lib/utils';
import { presets } from '../table.styles';

export interface TableHeaderRowProps {
  readonly children: React.ReactNode;
  readonly stickyOffset?: number; // Top offset in pixels for sticky positioning
  readonly className?: string;
}

export function TableHeaderRow({
  children,
  stickyOffset = 0,
  className,
}: TableHeaderRowProps) {
  return (
    <tr
      className={cn(presets.tableHeaderRow, className)}
      style={stickyOffset > 0 ? { top: `${stickyOffset}px` } : undefined}
    >
      {children}
    </tr>
  );
}
