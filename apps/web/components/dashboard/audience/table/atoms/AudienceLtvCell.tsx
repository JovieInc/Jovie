'use client';

import { SimpleTooltip } from '@jovie/ui';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateLtv, type LtvBreakdown } from '@/lib/utils/ltv';

export interface AudienceLtvCellProps {
  readonly tipAmountTotalCents: number;
  readonly tipCount: number;
  readonly visits: number;
  readonly engagementScore: number;
  readonly className?: string;
}

const TIER_STYLES = {
  none: 'text-tertiary-token',
  low: 'text-secondary-token',
  medium: 'text-amber-600 dark:text-amber-400 font-medium',
  high: 'text-emerald-600 dark:text-emerald-400 font-semibold',
} as const;

const TIER_ICON_STYLES = {
  none: 'text-tertiary-token',
  low: 'text-secondary-token',
  medium: 'text-amber-500',
  high: 'text-emerald-500',
} as const;

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function LtvTooltipContent({
  breakdown,
}: {
  readonly breakdown: LtvBreakdown;
}) {
  return (
    <div className='flex flex-col gap-1.5 text-[12px]'>
      <div className='font-medium text-primary-token'>Lifetime Value</div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Tip total</span>
        <span className='text-secondary-token'>
          {formatDollars(breakdown.tipTotalDollars * 100)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Tips sent</span>
        <span className='text-secondary-token'>{breakdown.tipCount}</span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Visits</span>
        <span className='text-secondary-token'>{breakdown.visits}</span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Engagement</span>
        <span className='text-secondary-token'>
          {breakdown.engagementScore}
        </span>
      </div>
    </div>
  );
}

export function AudienceLtvCell({
  tipAmountTotalCents,
  tipCount,
  visits,
  engagementScore,
  className,
}: AudienceLtvCellProps) {
  const breakdown = calculateLtv({
    tipAmountTotalCents,
    tipCount,
    visits,
    engagementScore,
  });

  const content = (
    <div className={cn('flex items-center gap-1.5 text-[13px]', className)}>
      {breakdown.tier !== 'none' && (
        <TrendingUp
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            TIER_ICON_STYLES[breakdown.tier]
          )}
          aria-hidden='true'
        />
      )}
      <span className={TIER_STYLES[breakdown.tier]}>{breakdown.label}</span>
    </div>
  );

  if (breakdown.tier === 'none') {
    return content;
  }

  return (
    <SimpleTooltip
      content={<LtvTooltipContent breakdown={breakdown} />}
      side='top'
    >
      {content}
    </SimpleTooltip>
  );
}
