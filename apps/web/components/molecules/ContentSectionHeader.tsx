import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContentSectionHeaderProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly density?: 'default' | 'compact';
  readonly variant?: 'default' | 'plain';
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
  variant = 'default',
  className,
  bodyClassName,
  titleClassName,
  subtitleClassName,
  actionsClassName,
}: Readonly<ContentSectionHeaderProps>) {
  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center justify-between gap-2 px-(--linear-app-header-padding-x)',
        variant === 'default' && 'border-b border-subtle bg-transparent',
        density === 'compact'
          ? 'min-h-[38px] py-1.5'
          : 'min-h-(--linear-app-header-height) py-1.5',
        className
      )}
    >
      <div className={cn('min-w-0 flex-1 space-y-0', bodyClassName)}>
        <h2
          className={cn(
            'truncate text-[12.5px] font-semibold tracking-[-0.012em] text-primary-token',
            titleClassName
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            className={cn(
              'text-[11.5px] leading-[15px] text-tertiary-token',
              subtitleClassName
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            'ml-auto flex shrink-0 items-center justify-end gap-1',
            actionsClassName
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
