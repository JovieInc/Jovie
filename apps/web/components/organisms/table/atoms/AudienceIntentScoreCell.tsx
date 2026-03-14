'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Flame, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceIntentScoreCellProps {
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

const INTENT_LABELS: Record<AudienceIntentLevel, string> = {
  high: 'High intent',
  medium: 'Medium intent',
  low: 'Low intent',
};

export function AudienceIntentScoreCell({
  intentLevel,
  className,
}: AudienceIntentScoreCellProps) {
  let icon: React.ReactElement;

  if (intentLevel === 'high') {
    icon = (
      <Flame
        className='h-3.5 w-3.5 shrink-0 text-emerald-500'
        aria-hidden='true'
      />
    );
  } else if (intentLevel === 'medium') {
    icon = (
      <TrendingUp
        className='h-3.5 w-3.5 shrink-0 text-amber-400'
        aria-hidden='true'
      />
    );
  } else {
    icon = (
      <TrendingDown
        className='h-3.5 w-3.5 shrink-0 text-zinc-500'
        aria-hidden='true'
      />
    );
  }

  return (
    <SimpleTooltip content={INTENT_LABELS[intentLevel]} side='top'>
      <div className={cn('flex items-center justify-center w-8', className)}>
        {icon}
      </div>
    </SimpleTooltip>
  );
}
