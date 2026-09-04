// @coverage-via apps/web/tests/unit/dashboard/SettingsActionRow.test.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  getSettingsRowDataState,
  getSettingsRowDescriptionClassName,
  getSettingsRowIconClassName,
  getSettingsRowTitleClassName,
  type SettingsRowTone,
} from './settings-row-state';

export interface SettingsActionRowProps {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly tone?: SettingsRowTone;
  readonly disabled?: boolean;
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
  tone = 'default',
  disabled = false,
  className,
  titleClassName,
  descriptionClassName,
  actionClassName,
}: Readonly<SettingsActionRowProps>) {
  const rowState = getSettingsRowDataState({ disabled });

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
      data-state={rowState}
      data-tone={tone}
      aria-disabled={disabled || undefined}
    >
      <div className='flex min-w-0 items-start gap-3'>
        {icon ? (
          <div
            className={getSettingsRowIconClassName({ state: rowState, tone })}
          >
            {icon}
          </div>
        ) : null}
        <div className='min-w-0'>
          <p
            className={getSettingsRowTitleClassName({
              state: rowState,
              tone,
              className: titleClassName,
            })}
          >
            {title}
          </p>
          {description ? (
            <p
              className={getSettingsRowDescriptionClassName({
                state: rowState,
                className: cn('max-w-[56ch]', descriptionClassName),
              })}
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
