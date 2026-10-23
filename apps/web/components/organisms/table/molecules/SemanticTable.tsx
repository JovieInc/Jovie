import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type TableRowMode, tableRowModeStyle } from '../table.styles';

export function TableRoot({
  children,
  className,
  rowMode,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'table'>, 'style'> & {
    children: ReactNode;
    rowMode?: TableRowMode;
  }
>) {
  return (
    <table
      {...props}
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
