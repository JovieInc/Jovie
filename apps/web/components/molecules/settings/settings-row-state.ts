import { cn } from '@jovie/ui/lib/utils';

export type SettingsRowTone = 'default' | 'destructive';
export type SettingsRowDataState = 'idle' | 'disabled' | 'gated';

export interface SettingsRowStateOptions {
  readonly state?: SettingsRowDataState;
  readonly tone?: SettingsRowTone;
  readonly className?: string;
}

export function getSettingsRowDataState({
  disabled = false,
  gated = false,
}: {
  readonly disabled?: boolean;
  readonly gated?: boolean;
}): SettingsRowDataState {
  if (gated) return 'gated';
  if (disabled) return 'disabled';
  return 'idle';
}

export function getSettingsRowIconClassName({
  state = 'idle',
  tone = 'default',
  className,
}: SettingsRowStateOptions = {}): string {
  return cn(
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
    state === 'disabled'
      ? 'border-subtle bg-surface-0 text-(--color-text-disabled-token)'
      : state === 'gated'
        ? 'border-subtle bg-surface-0 text-tertiary-token'
        : tone === 'destructive'
          ? 'border-error/20 bg-error-subtle text-error'
          : 'border-subtle bg-surface-0 text-secondary-token',
    className
  );
}

export function getSettingsRowTitleClassName({
  state = 'idle',
  tone = 'default',
  className,
}: SettingsRowStateOptions = {}): string {
  return cn(
    'text-app font-[540] tracking-tighter',
    state === 'disabled'
      ? 'text-(--color-text-disabled-token)'
      : state === 'gated'
        ? 'text-tertiary-token'
        : tone === 'destructive'
          ? 'text-error'
          : 'text-primary-token',
    className
  );
}

export function getSettingsRowDescriptionClassName({
  state = 'idle',
  className,
}: Omit<SettingsRowStateOptions, 'tone'> = {}): string {
  return cn(
    'mt-1 text-xs leading-4',
    state === 'idle' ? 'text-secondary-token' : 'text-quaternary-token',
    className
  );
}
