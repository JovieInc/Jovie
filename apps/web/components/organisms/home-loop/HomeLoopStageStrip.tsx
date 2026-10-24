// @coverage-via apps/web/components/organisms/home-loop/HomeLoopKanban.test.tsx

import type { HomeLoopStripItem } from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';

const VALUE_TONE: Record<HomeLoopStripItem['tone'], string> = {
  good: 'text-primary-token',
  neutral: 'text-primary-token',
  warn: 'text-warning',
  bad: 'text-error',
};

/**
 * One line of stage timing (7-day p50 / p95 spans and flow p95s) under the
 * pulse. It wraps to at most two lines and clips the rest; coverage says how
 * much of the pipeline is measured, so a short strip is never read as fast.
 */
export function HomeLoopStageStrip({
  title,
  items,
  appearance = 'default',
  coverage,
  emptyLabel,
}: Readonly<{
  readonly appearance?: 'default' | 'quiet';
  readonly title: string;
  readonly items: readonly HomeLoopStripItem[];
  readonly coverage?: string | null;
  readonly emptyLabel: string;
}>) {
  return (
    <section
      aria-label={title}
      className='flex max-h-10 min-w-0 shrink-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 overflow-hidden text-xs text-secondary-token'
      data-testid='home-loop-stage-strip'
    >
      <h2 className='shrink-0 text-balance font-medium text-primary-token'>
        {title}
      </h2>
      {items.length === 0 ? (
        <span className='text-tertiary-token'>{emptyLabel}</span>
      ) : (
        items.map(item => (
          <span
            key={item.id}
            className='whitespace-nowrap'
            data-testid='home-loop-strip-item'
            data-tone={item.tone}
          >
            {`${item.label} `}
            <span
              className={cn(
                'font-medium tabular-nums',
                appearance === 'quiet'
                  ? 'text-primary-token'
                  : VALUE_TONE[item.tone]
              )}
            >
              {item.value}
              {appearance === 'quiet' && item.tone === 'warn'
                ? ' · Needs attention'
                : null}
              {appearance === 'quiet' && item.tone === 'bad'
                ? ' · Problem'
                : null}
            </span>
          </span>
        ))
      )}
      {coverage ? (
        <span className='whitespace-nowrap text-tertiary-token'>
          {coverage}
        </span>
      ) : null}
    </section>
  );
}
