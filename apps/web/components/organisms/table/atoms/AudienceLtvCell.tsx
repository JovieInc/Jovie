'use client';

import { SimpleTooltip } from '@jovie/ui';
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
  high: 'text-emerald-600 dark:text-emerald-400 font-semibold',
} as const;

export function formatDollars(cents: number): string {
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

  // Show dollar amount for non-zero, dash for none
  const displayLabel =
    breakdown.tier === 'none'
      ? '---'
      : formatDollars(breakdown.totalValueCents);

  const content = (
    <div className={cn('flex items-center text-[13px]', className)}>
      <span className={cn('tabular-nums', TIER_STYLES[breakdown.tier])}>
        {displayLabel}
      </span>
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
