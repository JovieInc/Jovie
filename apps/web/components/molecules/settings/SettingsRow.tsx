import type { ReactNode } from 'react';
import { PRO_PLAN_DISPLAY_NAME } from '@/lib/config/plan-prices';
import { cn } from '@/lib/utils';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

export type SettingsRowTone = 'default' | 'destructive';
export type SettingsRowState = 'idle' | 'disabled' | 'gated';

export interface SettingsRowGate {
  readonly planName?: string;
  readonly featureContext?: string;
}

export interface SettingsRowProps {
  /** Row title: what the setting is. */
  readonly title: string;
  /** One muted line under the title; it truncates rather than wraps. */
  readonly description?: string;
  /** Exactly one trailing control: a Select, Switch, Button or value. */
  readonly control?: ReactNode;
  readonly tone?: SettingsRowTone;
  readonly disabled?: boolean;
  /** Replaces the control with the plan upgrade label. */
  readonly gated?: SettingsRowGate;
  /** Base id: the title and description get `${id}-title`/`-description`. */
  readonly id?: string;
  /** Optional full-width body under the row, such as an inline editor. */
  readonly children?: ReactNode;
  readonly 'data-testid'?: string;
}

/** The ids a row's control points aria-labelledby/aria-describedby at. */
export function settingsRowIds(id: string, hasDescription = true) {
  return {
    titleId: `${id}-title`,
    descriptionId: hasDescription ? `${id}-description` : undefined,
  };
}

function getRowState(disabled: boolean, gated: boolean): SettingsRowState {
  if (gated) return 'gated';
  if (disabled) return 'disabled';
  return 'idle';
}

const TITLE_CLASS = {
  idle: 'text-primary-token',
  destructive: 'text-error-text',
  disabled: 'text-(--color-text-disabled-token)',
  gated: 'text-tertiary-token',
} as const;

/**
 * SettingsRow is the one settings row: a title, one muted line of
 * description and one control on the right. Rows stack inside a
 * SettingsGroup, which owns the rounded surface and the hairline dividers,
 * so a row carries no chrome, icon or className overrides of its own.
 */
export function SettingsRow({
  title,
  description,
  control,
  tone = 'default',
  disabled = false,
  gated,
  id,
  children,
  'data-testid': testId,
}: Readonly<SettingsRowProps>) {
  const state = getRowState(disabled, Boolean(gated));
  const ids = id ? settingsRowIds(id, Boolean(description)) : undefined;
  const titleKey = state === 'idle' && tone === 'destructive' ? tone : state;
  const trailing = gated ? (
    <SettingsPlanGateLabel
      planName={gated.planName ?? PRO_PLAN_DISPLAY_NAME}
      featureContext={gated.featureContext}
    />
  ) : (
    control
  );

  return (
    <div
      data-settings-row=''
      data-state={state}
      data-tone={tone}
      aria-disabled={disabled || undefined}
      data-testid={testId}
    >
      <div className='flex items-center gap-4 px-4 py-3.5'>
        <div className='min-w-0 flex-1'>
          <p
            id={ids?.titleId}
            className={cn('text-sm font-medium', TITLE_CLASS[titleKey])}
          >
            {title}
          </p>
          {description ? (
            <p
              id={ids?.descriptionId}
              title={description}
              className={cn(
                'mt-0.5 truncate text-xs',
                state === 'idle'
                  ? 'text-secondary-token'
                  : 'text-quaternary-token'
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {trailing ? (
          <div className='flex shrink-0 items-center'>{trailing}</div>
        ) : null}
      </div>
      {children ? <div className='px-4 pb-3.5'>{children}</div> : null}
    </div>
  );
}
