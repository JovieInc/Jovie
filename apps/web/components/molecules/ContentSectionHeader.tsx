import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContentSectionHeaderProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly density?: 'default' | 'compact';
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly titleClassName?: string;
  readonly subtitleClassName?: string;
  readonly actionsClassName?: string;
}

export function ContentSectionHeader({
  title,
  subtitle,
  actions,
  density = 'default',
  className,
  bodyClassName,
  titleClassName,
  subtitleClassName,
  actionsClassName,
}: Readonly<ContentSectionHeaderProps>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] px-(--linear-app-header-padding-x)',
        density === 'compact'
          ? 'min-h-[36px] py-1'
          : 'min-h-(--linear-app-header-height) py-1.5',
        className
      )}
    >
      <div className={cn('min-w-0 flex-1 space-y-0', bodyClassName)}>
        <h2
          className={cn(
            'truncate text-[12px] font-[560] tracking-[-0.014em] text-primary-token',
            titleClassName
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            className={cn(
              'text-[11px] leading-[14px] text-tertiary-token',
              subtitleClassName
            )}
          >
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
