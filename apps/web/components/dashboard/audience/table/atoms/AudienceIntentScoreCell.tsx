'use client';

import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceIntentScoreCellProps {
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

const INTENT_DOT_STYLES: Record<AudienceIntentLevel, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-400',
  low: 'bg-zinc-400',
};

const INTENT_LABEL_STYLES: Record<AudienceIntentLevel, string> = {
  high: 'text-emerald-600 dark:text-emerald-400 font-semibold',
  medium: 'text-amber-600 dark:text-amber-400 font-medium',
  low: 'text-tertiary-token',
};

export function AudienceIntentScoreCell({
  intentLevel,
  className,
}: AudienceIntentScoreCellProps) {
  const label =
    intentLevel.charAt(0).toUpperCase() + intentLevel.slice(1);

  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span
        className={cn(
          'inline-block size-2 shrink-0 rounded-full',
          INTENT_DOT_STYLES[intentLevel]
        )}
        aria-hidden='true'
      />
      <span className={INTENT_LABEL_STYLES[intentLevel]}>{label}</span>
    </div>
  );
}
