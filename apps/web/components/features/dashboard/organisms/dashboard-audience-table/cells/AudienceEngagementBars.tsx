'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

export interface AudienceEngagementBarsProps {
  /** 0–100 engagement score from server */
  readonly score: number;
}

const BARS = 5;

/** 5 vertical bars at 20-point steps. Score=0 renders distinctly (no bars lit). */
export const AudienceEngagementBars = memo(function AudienceEngagementBars({
  score,
}: AudienceEngagementBarsProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const lit = Math.ceil(clamped / 20);
  const filled = clamped === 0 ? 0 : Math.max(1, lit);

  return (
    <div
      className='flex h-4 items-end gap-0.5'
      aria-label={`Engagement ${filled} of ${BARS}`}
      role='img'
    >
      {(['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5'] as const).map(
        (heightClass, i) => (
          <span
            key={heightClass}
            className={cn(
              'w-0.5 rounded-sm',
              heightClass,
              i < filled ? 'bg-emerald-500/70' : 'bg-zinc-700/50'
            )}
            aria-hidden='true'
          />
        )
      )}
    </div>
  );
});
