import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContentSectionHeaderProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly actionsClassName?: string;
}

export function ContentSectionHeader({
  title,
  subtitle,
  actions,
  className,
  bodyClassName,
  actionsClassName,
}: Readonly<ContentSectionHeaderProps>) {
  return (
    <div
      className={cn(
        'flex min-h-[var(--linear-app-header-height)] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-(--linear-border-subtle) bg-transparent px-[var(--linear-app-header-padding-x)] py-1.5',
        className
      )}
    >
      <div className={cn('min-w-0 flex-1 space-y-0.5', bodyClassName)}>
        <h2 className='truncate text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
          {title}
        </h2>
        {subtitle ? (
          <p className='text-[12px] leading-[18px] text-(--linear-text-secondary)'>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className={cn('w-full sm:w-auto', actionsClassName)}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
