'use client';

import { Activity } from 'lucide-react';
import { computeRatePercent } from '@/lib/analytics/metrics';
import type { SummerOpsCard } from '@/lib/ovie/ops-card';
import { cn } from '@/lib/utils';
import { ChatToolSurface } from './ChatToolSurface';

const STATE_LABELS: Record<SummerOpsCard['state'], string> = {
  fresh: 'Live',
  stale: 'Stale',
  degraded: 'Degraded',
  disconnected: 'Disconnected',
  unavailable: 'Unavailable',
  unauthorized: 'Unauthorized',
  unknown: 'Unknown',
};

function formatObservedAt(observedAt: string | null): string | null {
  if (!observedAt) return null;
  const ms = Date.parse(observedAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function seriesMax(card: SummerOpsCard): number {
  return Math.max(1, ...(card.series?.points.map(point => point.value) ?? []));
}

export interface ChatOpsDataCardProps {
  readonly card: SummerOpsCard;
  /** One-line receipt summary shown under the title when present. */
  readonly summary?: string;
}

/**
 * Editorial card for shared operational data in the founder chat
 * (JOV-6708): Summer tool receipts carry a `summer.ops-card.v1` payload and
 * this renders it — fact list plus a bar chart when a measured series is
 * present. Only values emitted in the payload are shown.
 */
export function ChatOpsDataCard({ card, summary }: ChatOpsDataCardProps) {
  const observed = formatObservedAt(card.observedAt);
  const max = seriesMax(card);

  return (
    <ChatToolSurface>
      <section
        className='w-full max-w-3xl px-4 py-4'
        aria-label={card.title}
        data-testid='chat-ops-data-card'
        data-card-kind={card.kind}
        data-card-state={card.state}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='flex min-w-0 items-start gap-2'>
            <div className='flex h-5 w-5 shrink-0 items-center justify-center text-tertiary-token'>
              <Activity className='h-3.5 w-3.5' strokeWidth={2} />
            </div>
            <div className='min-w-0'>
              <p className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
                {card.kind.replaceAll('-', ' ')}
              </p>
              <p className='mt-0.5 text-sm font-semibold leading-5 text-primary-token'>
                {card.title}
              </p>
            </div>
          </div>
          <span
            data-testid='chat-ops-data-card-state'
            data-state={card.state}
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-2xs font-caption text-secondary-token',
              card.state === 'fresh' && 'text-primary-token'
            )}
          >
            {STATE_LABELS[card.state]}
          </span>
        </div>

        {summary || card.summary ? (
          <p className='mt-1.5 text-xs leading-5 text-secondary-token'>
            {summary ?? card.summary}
          </p>
        ) : null}

        {card.facts.length > 0 ? (
          <dl
            className='mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3'
            data-testid='chat-ops-data-card-facts'
          >
            {card.facts.map(fact => (
              <div key={fact.label} className='min-w-0'>
                <dt className='text-2xs font-medium leading-4 text-tertiary-token'>
                  {fact.label}
                </dt>
                <dd className='mt-0.5 truncate text-sm font-semibold leading-5 text-primary-token'>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {card.series ? (
          <div className='mt-3' data-testid='chat-ops-data-card-chart'>
            <p className='text-2xs font-medium leading-4 text-tertiary-token'>
              {card.series.label}
              {card.series.unit ? ` (${card.series.unit})` : ''}
            </p>
            <ul
              className='mt-1.5 flex flex-col gap-1.5'
              role='img'
              aria-label={`${card.series.label}: ${card.series.points
                .map(point => `${point.label} ${point.value}`)
                .join(', ')}`}
            >
              {card.series.points.map(point => (
                <li key={point.label} className='flex items-center gap-2'>
                  <span className='w-28 shrink-0 truncate text-2xs leading-4 text-tertiary-token'>
                    {point.label}
                  </span>
                  <span className='h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-0'>
                    <span
                      className='block h-full rounded-full bg-primary-token/60'
                      style={{
                        width: `${Math.max(2, computeRatePercent(point.value, max))}%`,
                      }}
                    />
                  </span>
                  <span className='w-12 shrink-0 text-right text-2xs font-medium leading-4 text-primary-token tabular-nums'>
                    {point.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className='mt-3 flex items-center justify-between gap-3 border-subtle border-t pt-2'>
          <p className='text-2xs leading-4 text-tertiary-token'>
            {observed ? `Observed ${observed}` : 'Observation time unavailable'}
            {card.source ? ` · ${card.source}` : ''}
          </p>
        </div>
      </section>
    </ChatToolSurface>
  );
}
