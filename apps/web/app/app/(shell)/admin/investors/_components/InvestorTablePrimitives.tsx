import type { ReactNode } from 'react';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableHeaderRow,
  TableRoot,
  TableRow,
} from '@/components/organisms/table';
import { presets, rowState } from '@/components/organisms/table/table.styles';
import { cn } from '@/lib/utils';

export function InvestorTable({
  children,
  minWidth = 'min-w-investor-table',
}: Readonly<{
  children: ReactNode;
  minWidth?: string;
}>) {
  return (
    <div className='w-full min-w-0 overflow-x-auto'>
      <TableRoot
        rowMode='two-line'
        className={cn('w-full border-collapse text-app', minWidth)}
      >
        {children}
      </TableRoot>
    </div>
  );
}

export function InvestorTableHead({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <TableHead className='bg-surface-0'>{children}</TableHead>;
}

export function InvestorTableBody({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <TableBody>{children}</TableBody>;
}

export function InvestorTableHeaderRow({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <TableHeaderRow className='border-b border-subtle text-left text-2xs font-caption text-secondary-token'>
      {children}
    </TableHeaderRow>
  );
}

export function InvestorTableHeaderCell({
  children,
  align = 'left',
  className,
}: Readonly<{
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}>) {
  return (
    <TableHeaderCell
      align={align}
      sticky={false}
      className={cn('px-3 py-1.5 font-medium', className)}
    >
      {children}
    </TableHeaderCell>
  );
}

export function InvestorTableRow({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <TableRow
      className={cn(
        presets.tableRow,
        'border-b border-subtle bg-transparent',
        rowState.hover
      )}
    >
      {children}
    </TableRow>
  );
}

export function InvestorTableCell({
  children,
  align = 'left',
  className,
  multiline = false,
}: Readonly<{
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  multiline?: boolean;
}>) {
  return (
    <TableCell
      align={align}
      multiline={multiline}
      className={cn('px-3 py-1 align-middle', className)}
    >
      {children}
    </TableCell>
  );
}
