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
import { cn } from '@/lib/utils';

export function InvestorTable({
  children,
  minWidth = 'min-w-[760px]',
}: Readonly<{
  children: ReactNode;
  minWidth?: string;
}>) {
  return (
    <div className='overflow-x-auto'>
      <TableRoot className={cn('w-full border-collapse text-app', minWidth)}>
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
      className={cn('px-4 py-2.5 font-medium', className)}
    >
      {children}
    </TableHeaderCell>
  );
}

export function InvestorTableRow({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <TableRow className='border-b border-subtle bg-transparent transition-colors duration-subtle hover:bg-surface-0'>
      {children}
    </TableRow>
  );
}

export function InvestorTableCell({
  children,
  align = 'left',
  className,
}: Readonly<{
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}>) {
  return (
    <TableCell
      align={align}
      className={cn('px-4 py-3 align-middle', className)}
    >
      {children}
    </TableCell>
  );
}
