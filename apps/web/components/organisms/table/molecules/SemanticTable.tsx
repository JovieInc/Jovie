import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type TableRowMode, tableRowModeStyle } from '../table.styles';

export function TableRoot({
  children,
  className,
  rowMode,
}: Readonly<{
  children: ReactNode;
  className?: string;
  rowMode?: TableRowMode;
}>) {
  return (
    <table
      className={className}
      data-table-row-mode={rowMode}
      style={tableRowModeStyle(rowMode)}
    >
      {children}
    </table>
  );
}

export function TableHead({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <tr className={cn(className)}>{children}</tr>;
}
