import type { ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

export interface SettingsPanelProps {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly headerClassName?: string;
  readonly titleClassName?: string;
  readonly descriptionClassName?: string;
  readonly actionsClassName?: string;
  readonly cardClassName?: string;
}

export function SettingsPanel({
  title,
  description,
  actions,
  children,
  className,
  headerClassName,
  titleClassName,
  descriptionClassName,
  actionsClassName,
  cardClassName,
}: Readonly<SettingsPanelProps>) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <div className={cn('space-y-2', className)}>
      {hasHeader ? (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-2 sm:gap-2.5',
            headerClassName
          )}
        >
          <div className='min-w-0 flex-1 space-y-0.5'>
            {title ? (
              <h3
                className={cn(
                  'text-app font-[540] tracking-[-0.02em] text-primary-token',
                  titleClassName
                )}
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <p
                className={cn(
                  'max-w-[56ch] text-xs leading-[16px] text-secondary-token',
                  descriptionClassName
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div
              className={cn(
                'flex shrink-0 items-center gap-2',
                actionsClassName
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      <ContentSurfaceCard
        surface='settings'
        className={cn('overflow-hidden', cardClassName)}
      >
        {children}
      </ContentSurfaceCard>
    </div>
  );
}
