import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminTableHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

interface AdminTableSubheaderProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function AdminTableHeader({
  title,
  subtitle,
  actions,
  className,
}: Readonly<AdminTableHeaderProps>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-subtle px-3 py-3 sm:px-4',
        className
      )}
    >
      <div className='space-y-1'>
        <h2 className='text-sm font-semibold text-primary-token'>{title}</h2>
        <p className='text-xs text-secondary-token'>{subtitle}</p>
      </div>
      {actions ? <div className='w-full sm:w-auto'>{actions}</div> : null}
    </div>
  );
}

export function AdminTableSubheader({
  children,
  className,
}: Readonly<AdminTableSubheaderProps>) {
  return (
    <div className={cn('border-b border-subtle px-3 py-2 sm:px-4', className)}>
      {children}
    </div>
  );
}
