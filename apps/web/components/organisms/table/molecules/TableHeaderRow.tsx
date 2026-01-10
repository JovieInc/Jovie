import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TableHeaderRowProps {
  children: ReactNode;
  stickyOffset?: number; // Top offset in pixels for sticky positioning
  className?: string;
}

export function TableHeaderRow({
  children,
  stickyOffset = 0,
  className,
}: TableHeaderRowProps) {
  return (
    <tr
      className={cn('h-12', className)}
      style={stickyOffset > 0 ? { top: `${stickyOffset}px` } : undefined}
    >
      {children}
    </tr>
  );
}
