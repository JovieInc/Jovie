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
        'flex min-h-[34px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--linear-app-frame-seam) bg-transparent px-(--linear-app-header-padding-x) py-0.5',
        className
      )}
    >
      <div className={cn('min-w-0 flex-1 space-y-0', bodyClassName)}>
        <h2 className='truncate text-[13px] font-[500] text-secondary-token'>
          {title}
        </h2>
        {subtitle ? (
          <p className='text-[11.5px] leading-[16px] text-secondary-token'>
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
