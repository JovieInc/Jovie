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
        'flex min-h-[38px] shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] px-(--linear-app-header-padding-x) py-1',
        className
      )}
    >
      <div className={cn('min-w-0 flex-1 space-y-0', bodyClassName)}>
        <h2 className='truncate text-[13px] font-[560] tracking-[-0.012em] text-primary-token'>
          {title}
        </h2>
        {subtitle ? (
          <p className='text-[11px] leading-[15px] text-tertiary-token'>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn('w-full sm:w-auto sm:justify-end', actionsClassName)}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
