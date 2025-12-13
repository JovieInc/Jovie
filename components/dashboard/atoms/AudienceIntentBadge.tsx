'use client';

import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceIntentBadgeProps {
  intentLevel: AudienceIntentLevel;
  className?: string;
}

const INTENT_BADGES: Record<
  AudienceIntentLevel,
  { label: string; className: string; dotClassName: string }
> = {
  high: {
    label: 'High intent',
    className: 'border border-subtle bg-surface-2/60 text-primary-token',
    dotClassName: 'bg-primary-token',
  },
  medium: {
    label: 'Medium intent',
    className: 'border border-subtle bg-surface-2/40 text-secondary-token',
    dotClassName: 'bg-secondary-token',
  },
  low: {
    label: 'Low intent',
    className: 'border border-subtle bg-transparent text-secondary-token',
    dotClassName: 'bg-secondary-token/40',
  },
};

export function AudienceIntentBadge({
  intentLevel,
  className,
}: AudienceIntentBadgeProps) {
  const badge = INTENT_BADGES[intentLevel];

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide',
        badge.className,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mr-1.5 inline-block size-1.5 shrink-0 rounded-full',
          badge.dotClassName
        )}
      />
      {badge.label}
    </span>
  );
}
