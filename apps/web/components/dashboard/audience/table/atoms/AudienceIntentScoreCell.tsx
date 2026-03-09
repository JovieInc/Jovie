'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceIntentScoreCellProps {
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

const INTENT_DOT_STYLES: Record<AudienceIntentLevel, string> = {
  high: 'text-emerald-500 fill-emerald-500',
  medium: 'text-amber-400 fill-amber-400',
  low: 'text-zinc-500 fill-zinc-500',
};

const INTENT_LABELS: Record<AudienceIntentLevel, string> = {
  high: 'High intent',
  medium: 'Medium intent',
  low: 'Low intent',
};

export function AudienceIntentScoreCell({
  intentLevel,
  className,
}: AudienceIntentScoreCellProps) {
  return (
    <SimpleTooltip content={INTENT_LABELS[intentLevel]} side='top'>
      <div className={cn('flex items-center justify-center w-8', className)}>
        <Circle
          className={cn('h-2 w-2 shrink-0', INTENT_DOT_STYLES[intentLevel])}
          aria-label={INTENT_LABELS[intentLevel]}
        />
      </div>
    </SimpleTooltip>
  );
}
