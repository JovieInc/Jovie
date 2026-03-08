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
  readonly streamingClicks?: number;
  readonly tipClickValueCents?: number;
  readonly merchSalesCents?: number;
  readonly ticketSalesCents?: number;
  readonly className?: string;
}

const TIER_STYLES = {
  none: 'text-tertiary-token',
  low: 'text-secondary-token',
  medium: 'text-amber-600 dark:text-amber-400 font-[510]',
  high: 'text-emerald-600 dark:text-emerald-400 font-[590]',
} as const;

const TIER_ICON_STYLES = {
  none: 'text-tertiary-token',
  low: 'text-secondary-token',
  medium: 'text-amber-500',
  high: 'text-emerald-500',
} as const;

function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
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
    <div className='flex min-w-56 flex-col gap-1.5 text-[12px]'>
      <div className='flex items-center justify-between gap-4 border-b border-subtle pb-1.5'>
        <span className='font-[510] text-primary-token'>Lifetime Value</span>
        <span className='font-[510] text-primary-token'>
          {formatDollars(breakdown.totalValueCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Streaming clicks</span>
        <span className='text-secondary-token'>
          {breakdown.streamingClicks} ·{' '}
          {formatDollars(breakdown.streamingValueCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Tips</span>
        <span className='text-secondary-token'>
          {breakdown.tipCount} · {formatDollars(breakdown.tipClickValueCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Merch sales</span>
        <span className='text-secondary-token'>
          {formatDollars(breakdown.merchSalesCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-tertiary-token'>Ticket sales</span>
        <span className='text-secondary-token'>
          {formatDollars(breakdown.ticketSalesCents)}
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
  streamingClicks,
  tipClickValueCents,
  merchSalesCents,
  ticketSalesCents,
  className,
}: AudienceLtvCellProps) {
  const breakdown = calculateLtv({
    tipAmountTotalCents,
    tipCount,
    visits,
    engagementScore,
    streamingClicks: streamingClicks ?? 0,
    tipClickValueCents: tipClickValueCents ?? 0,
    merchSalesCents: merchSalesCents ?? 0,
    ticketSalesCents: ticketSalesCents ?? 0,
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
