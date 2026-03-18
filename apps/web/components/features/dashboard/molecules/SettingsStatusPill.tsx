'use client';

import { cn } from '@/lib/utils';
import type { SaveStatus } from '@/types';

export type SettingsStatusPillState = 'saving' | 'saved' | 'error';

export interface SettingsStatusPillProps {
  readonly state?: SettingsStatusPillState;
  readonly status?: Pick<SaveStatus, 'saving' | 'success' | 'error'>;
  readonly className?: string;
}

function resolveState({ state, status }: SettingsStatusPillProps) {
  if (state) return state;
  if (!status) return null;
  if (status.saving) return 'saving';
  if (status.error) return 'error';
  if (status.success) return 'saved';
  return null;
}

export function SettingsStatusPill({
  state,
  status,
  className,
}: SettingsStatusPillProps) {
  const resolvedState = resolveState({ state, status });

  if (!resolvedState) {
    return null;
  }

  return (
    <div
      className={cn(
        'text-xs',
        resolvedState === 'error' ? 'text-destructive' : 'text-secondary-token',
        className
      )}
      aria-live='polite'
    >
      {resolvedState === 'saving' && 'Saving…'}
      {resolvedState === 'saved' && 'Saved'}
      {resolvedState === 'error' &&
        (status?.error ? status.error : 'Save failed')}
    </div>
  );
}
