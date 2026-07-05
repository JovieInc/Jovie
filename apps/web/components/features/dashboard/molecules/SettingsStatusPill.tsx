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

  // Always render the container so Saving… → Saved → idle transitions never
  // shift the surrounding form layout; idle just renders it invisible.
  return (
    <div
      className={cn(
        'min-h-4 text-xs',
        resolvedState === 'error' ? 'text-destructive' : 'text-secondary-token',
        !resolvedState && 'invisible',
        className
      )}
      aria-live='polite'
      data-state={resolvedState ?? 'idle'}
    >
      {resolvedState === 'saving' && 'Saving…'}
      {resolvedState === 'saved' && 'Saved'}
      {resolvedState === 'error' &&
        (status?.error ? status.error : 'Save failed')}
    </div>
  );
}
