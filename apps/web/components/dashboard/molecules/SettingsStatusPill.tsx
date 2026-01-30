'use client';

import { cn } from '@/lib/utils';

export type SettingsStatusPillState = 'saving' | 'saved';

export interface SettingsStatusPillProps {
  readonly state: SettingsStatusPillState;
  readonly className?: string;
}

export function SettingsStatusPill({
  state,
  className,
}: SettingsStatusPillProps) {
  return (
    <div
      className={cn('text-xs text-secondary-token', className)}
      aria-live='polite'
    >
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </div>
  );
}
