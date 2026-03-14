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
  none: 'text-(--linear-text-tertiary)',
  low: 'text-(--linear-text-secondary)',
  medium: 'text-amber-600 dark:text-amber-400 font-[510]',
  high: 'text-emerald-600 dark:text-emerald-400 font-[590]',
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
      <div className='flex items-center justify-between gap-4 border-b border-(--linear-border-subtle) pb-1.5'>
        <span className='font-[510] text-(--linear-text-primary)'>
          Lifetime Value
        </span>
        <span className='font-[510] text-(--linear-text-primary)'>
          {formatDollars(breakdown.totalValueCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-(--linear-text-tertiary)'>Streaming clicks</span>
        <span className='text-(--linear-text-secondary)'>
          {breakdown.streamingClicks} ·{' '}
          {formatDollars(breakdown.streamingValueCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-(--linear-text-tertiary)'>Tips</span>
        <span className='text-(--linear-text-secondary)'>
          {breakdown.tipCount} · {formatDollars(breakdown.tipClickValueCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-(--linear-text-tertiary)'>Merch sales</span>
        <span className='text-(--linear-text-secondary)'>
          {formatDollars(breakdown.merchSalesCents)}
        </span>
      </div>
      <div className='flex justify-between gap-4'>
        <span className='text-(--linear-text-tertiary)'>Ticket sales</span>
        <span className='text-(--linear-text-secondary)'>
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
    <div
      className={cn(
        'flex items-center justify-center w-8 text-[13px]',
        className
      )}
    >
      <span className={cn('font-[510]', TIER_STYLES[breakdown.tier])}>
        {breakdown.label}
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
