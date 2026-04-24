'use client';

import { SimpleTooltip } from '@jovie/ui';
import { Flame, Minus, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceEngagementCellProps {
  readonly visits: number;
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

const INTENT_ICONS: Record<
  AudienceIntentLevel,
  { icon: typeof Flame; color: string; label: string }
> = {
  high: { icon: Flame, color: 'text-emerald-500', label: 'High intent' },
  medium: {
    icon: TrendingUp,
    color: 'text-amber-400',
    label: 'Medium intent',
  },
  low: { icon: Minus, color: 'text-zinc-400', label: 'Low intent' },
};

export function AudienceEngagementCell({
  visits,
  intentLevel,
  className,
}: AudienceEngagementCellProps) {
  const { icon: IconComponent, color, label } = INTENT_ICONS[intentLevel];

  return (
    <SimpleTooltip
      content={`${visits} ${visits === 1 ? 'visit' : 'visits'} · ${label}`}
      side='top'
    >
      <div
        className={cn(
          'flex items-center gap-1.5 text-app text-secondary-token',
          className
        )}
      >
        <span className='tabular-nums font-[450]'>{visits}</span>
        <IconComponent
          className={cn('h-4 w-4 shrink-0', color)}
          aria-hidden='true'
        />
      </div>
    </SimpleTooltip>
  );
}
