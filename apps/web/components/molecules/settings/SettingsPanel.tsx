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
  /**
   * Optional canonical body wrapper. Use this instead of recreating the
   * settings card's responsive inset in every consumer.
   */
  readonly bodyClassName?: string;
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
  bodyClassName,
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
                className={[
                  'text-app font-[540] tracking-tighter text-primary-token',
                  titleClassName,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <p
                className={cn(
                  'max-w-[56ch] text-xs leading-4 text-secondary-token',
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
        {bodyClassName ? (
          <div className={bodyClassName}>{children}</div>
        ) : (
          children
        )}
      </ContentSurfaceCard>
    </div>
  );
}

export interface SettingsGroupProps {
  /** Plain section heading above the group. */
  readonly title?: string;
  /** One control beside the heading, such as an Add button. */
  readonly action?: ReactNode;
  /** SettingsRow elements; the group draws the hairlines between them. */
  readonly children: ReactNode;
  readonly 'data-testid'?: string;
}

/**
 * SettingsGroup is one settings section: a plain heading and ONE rounded
 * group whose rows are divided by hairlines. It takes no description,
 * padding or className, so every settings page has the same rhythm.
 * SettingsPanel above is the legacy shape; its consumers move here.
 */
export function SettingsGroup({
  title,
  action,
  children,
  'data-testid': testId,
}: Readonly<SettingsGroupProps>) {
  return (
    <div className='space-y-2' data-testid={testId}>
      {title || action ? (
        <div className='flex min-h-8 items-center justify-between gap-2'>
          {title ? (
            <h2 className='text-sm font-medium text-balance text-primary-token'>
              {title}
            </h2>
          ) : null}
          {action ? (
            <div className='ms-auto flex shrink-0 items-center'>{action}</div>
          ) : null}
        </div>
      ) : null}
      <ContentSurfaceCard
        surface='settings'
        className='overflow-hidden'
        data-settings-group=''
      >
        <div className='divide-y divide-(--app-shell-border)'>{children}</div>
      </ContentSurfaceCard>
    </div>
  );
}
