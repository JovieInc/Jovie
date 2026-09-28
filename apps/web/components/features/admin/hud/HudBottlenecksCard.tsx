'use client';

// @coverage-via apps/web/tests/unit/app/ops-cockpit.test.tsx

import { ExternalLink } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ShellListRowFrame } from '@/components/organisms/table';
import type { FounderFunnelData } from '@/lib/admin/types';
import { rankOpsBottlenecks } from '@/lib/hud/cockpit';
import type { HudMetrics } from '@/types/hud';

/**
 * Ranked bottlenecks — at most three, in impact order. When nothing is
 * measurably constraining the company the card says so instead of padding
 * with subsystem trivia.
 */
export function HudBottlenecksCard({
  metrics,
  funnel = null,
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly funnel?: FounderFunnelData | null;
}>) {
  const bottlenecks = rankOpsBottlenecks(metrics, funnel);

  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid='hud-bottlenecks'
    >
      <div className='space-y-2 p-3'>
        <p className='text-xs font-caption text-tertiary-token'>Bottlenecks</p>
        {bottlenecks.length === 0 ? (
          <p className='text-app text-secondary-token'>
            No bottlenecks detected.
          </p>
        ) : (
          <ol className='grid gap-2'>
            {bottlenecks.map((bottleneck, index) => (
              <ShellListRowFrame
                key={bottleneck.id}
                className='flex items-center gap-3 border border-subtle bg-surface-0 px-3 py-2'
              >
                <span className='shrink-0 text-xs font-semibold tabular-nums text-tertiary-token'>
                  {index + 1}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-app font-semibold text-primary-token'>
                    {bottleneck.title}
                  </p>
                  {bottleneck.detail ? (
                    <p className='mt-0.5 truncate text-2xs text-tertiary-token'>
                      {bottleneck.detail}
                    </p>
                  ) : null}
                </div>
                {bottleneck.href ? (
                  <a
                    href={bottleneck.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='shrink-0 text-tertiary-token transition-colors hover:text-primary-token'
                    aria-label={`Inspect ${bottleneck.title}`}
                  >
                    <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
                  </a>
                ) : null}
              </ShellListRowFrame>
            ))}
          </ol>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
