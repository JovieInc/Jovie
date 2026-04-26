import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SettingsActionRowProps {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
  readonly descriptionClassName?: string;
  readonly actionClassName?: string;
}

export function SettingsActionRow({
  icon,
  title,
  description,
  action,
  className,
  titleClassName,
  descriptionClassName,
  actionClassName,
}: Readonly<SettingsActionRowProps>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className='flex min-w-0 items-start gap-3'>
        {icon ? (
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
            {icon}
          </div>
        ) : null}
        <div className='min-w-0'>
          <p
            className={cn(
              'text-app font-semibold tracking-[-0.02em] text-primary-token',
              titleClassName
            )}
          >
            {title}
          </p>
          {description ? (
            <p
              className={cn(
                'mt-1 max-w-[56ch] text-xs leading-[16px] text-secondary-token',
                descriptionClassName
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {action ? (
        <div className={cn('shrink-0 self-start', actionClassName)}>
          {action}
        </div>
      ) : null}
    </div>
  );
}
