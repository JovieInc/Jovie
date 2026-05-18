import type { ReactNode } from 'react';
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
      <table className={cn('w-full border-collapse text-app', minWidth)}>
        {children}
      </table>
    </div>
  );
}

export function InvestorTableHead({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <thead className='bg-surface-0'>{children}</thead>;
}

export function InvestorTableHeaderRow({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <tr className='border-b border-subtle text-left text-2xs font-caption text-secondary-token'>
      {children}
    </tr>
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
    <th
      className={cn(
        'px-4 py-2.5 font-medium',
        align === 'right' && 'text-right',
        className
      )}
    >
      {children}
    </th>
  );
}

export function InvestorTableRow({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <tr className='border-b border-subtle bg-transparent transition-colors duration-subtle hover:bg-surface-0'>
      {children}
    </tr>
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
    <td
      className={cn(
        'px-4 py-3 align-middle',
        align === 'right' && 'text-right',
        className
      )}
    >
      {children}
    </td>
  );
}
