import type { ReactNode } from 'react';
import { PageToolbar } from '@/components/organisms/table';
import { cn } from '@/lib/utils';

interface AdminTableHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

interface AdminTableSubheaderProps {
  readonly children?: ReactNode;
  readonly start?: ReactNode;
  readonly end?: ReactNode;
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
        'flex flex-wrap items-start justify-between gap-3 border-b border-(--linear-border-subtle) bg-(--linear-app-content-surface) px-[var(--linear-app-header-padding-x)] py-2.5',
        className
      )}
    >
      <div className='space-y-0.5'>
        <h2 className='text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
          {title}
        </h2>
        <p className='text-[12px] leading-[18px] text-(--linear-text-secondary)'>
          {subtitle}
        </p>
      </div>
      {actions ? <div className='w-full sm:w-auto'>{actions}</div> : null}
    </div>
  );
}

export function AdminTableSubheader({
  children,
  start,
  end,
  className,
}: Readonly<AdminTableSubheaderProps>) {
  const hasToolbar = start !== undefined || end !== undefined;
  const toolbarContent = hasToolbar ? (
    <PageToolbar start={start ?? null} end={end} />
  ) : (
    children
  );

  return (
    <div
      className={cn(
        hasToolbar
          ? 'bg-(--linear-app-content-surface)'
          : 'border-b border-(--linear-border-subtle) bg-(--linear-app-content-surface) px-[var(--linear-app-header-padding-x)] py-2',
        className
      )}
    >
      {toolbarContent}
    </div>
  );
}
