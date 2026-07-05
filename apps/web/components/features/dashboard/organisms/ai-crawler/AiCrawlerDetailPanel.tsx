'use client';

import { Bot, TrendingDown, TrendingUp } from 'lucide-react';
import {
  DrawerSurfaceCard,
  EntitySidebarShell,
  StatTile,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { useAiCrawlerAnalyticsQuery } from '@/lib/queries/useAiCrawlerAnalyticsQuery';
import { cn } from '@/lib/utils';
import type { AiCrawlerStat } from '@/types/ai-crawler-analytics';

const ACCENT_COLORS = [
  'var(--color-accent-blue, #2563ff)',
  'var(--color-accent-purple, #8b1eff)',
  'var(--color-accent-pink, #d61a7f)',
  'var(--color-accent-teal, #22b8a7)',
  'var(--color-accent-orange, #ff9800)',
  'var(--color-accent-green, #2f9e44)',
] as const;

interface AiCrawlerDetailPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

function TrendBadge({ stat }: { readonly stat: AiCrawlerStat }) {
  const delta = stat.requests - stat.previousPeriodRequests;
  if (delta === 0) {
    return <span className='text-3xs text-tertiary-token'>Flat</span>;
  }

  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-3xs font-caption tabular-nums',
        positive ? 'text-accent-green' : 'text-tertiary-token'
      )}
    >
      <Icon className='h-3 w-3' aria-hidden='true' />
      {positive ? '+' : ''}
      {delta.toLocaleString()}
    </span>
  );
}

function CrawlerRows({
  loading,
  crawlers,
  blurred,
}: {
  readonly loading: boolean;
  readonly crawlers: readonly AiCrawlerStat[];
  readonly blurred: boolean;
}) {
  if (loading) {
    return (
      <ul className='min-h-49 space-y-2'>
        {[1, 2, 3, 4].map(index => (
          <li
            key={index}
            className='flex items-center justify-between px-2 py-2'
          >
            <LoadingSkeleton height='h-3' width='w-28' rounded='sm' />
            <LoadingSkeleton height='h-3' width='w-10' rounded='sm' />
          </li>
        ))}
      </ul>
    );
  }

  if (crawlers.length === 0) {
    return (
      <div className='flex min-h-49 flex-col items-center justify-center text-center'>
        <Bot
          className='mb-1.5 h-4 w-4 text-quaternary-token'
          aria-hidden='true'
        />
        <p className='text-xs text-tertiary-token'>
          No AI crawler visits recorded yet.
        </p>
      </div>
    );
  }

  const maxRequests = crawlers[0]?.requests ?? 1;

  return (
    <ul
      className='min-h-49 space-y-2'
      aria-label='AI crawlers by request count'
    >
      {crawlers.map((crawler, index) => {
        const widthPct = (crawler.requests / maxRequests) * 100;
        const accentColor = ACCENT_COLORS[index % ACCENT_COLORS.length];

        return (
          <li key={crawler.id} className='rounded-lg px-2 py-2'>
            <div className='flex items-center justify-between gap-2'>
              <span
                className={cn(
                  'text-app text-secondary-token',
                  blurred && 'blur-sm'
                )}
              >
                {crawler.name}
              </span>
              <div className='flex items-center gap-2'>
                {!blurred ? <TrendBadge stat={crawler} /> : null}
                <span className='text-app font-semibold tabular-nums text-primary-token'>
                  {blurred ? '—' : crawler.requests.toLocaleString()}
                </span>
              </div>
            </div>
            <div className='mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2'>
              <div
                className='h-full rounded-full'
                style={{
                  width: blurred ? '42%' : `${Math.max(widthPct, 4)}%`,
                  background: accentColor,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AiCrawlerDetailPanel({
  isOpen,
  onClose,
}: AiCrawlerDetailPanelProps) {
  const { data, isLoading } = useAiCrawlerAnalyticsQuery();
  const showTeaser = data?.isTeaser ?? false;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='AI crawler analytics'
      data-testid='ai-crawler-detail-panel'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      entityHeader={
        <DrawerSurfaceCard variant='card' className='overflow-hidden'>
          <div className='relative p-3.5'>
            <div className='absolute right-2.5 top-2.5'>
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[]}
                onClose={onClose}
              />
            </div>
            <div className='space-y-3 pr-8'>
              <div className='space-y-1'>
                <p className='text-mid font-semibold tracking-tight text-primary-token'>
                  AI Crawler Activity
                </p>
                <p className='text-xs leading-4 text-secondary-token'>
                  Which AI services read your profile and asset pages.
                </p>
              </div>
              <DrawerSurfaceCard
                variant='flat'
                className='grid grid-cols-2 gap-2 p-2'
              >
                <StatTile
                  label='30-Day Reads'
                  value={
                    isLoading ? '' : (data?.totalRequests ?? 0).toLocaleString()
                  }
                />
                <StatTile
                  label='This Week'
                  value={
                    isLoading
                      ? ''
                      : (data?.weeklyRequests ?? 0).toLocaleString()
                  }
                />
              </DrawerSurfaceCard>
            </div>
          </div>
        </DrawerSurfaceCard>
      }
    >
      <DrawerSurfaceCard variant='card' className='p-3'>
        {showTeaser ? (
          <div className='mb-3 rounded-lg border border-subtle bg-surface-0 px-3 py-3 text-center'>
            <p className='text-app text-secondary-token'>
              Upgrade to Pro to see named AI crawlers and 30-day trends.
            </p>
            <div className='mt-3 flex justify-center'>
              <UpgradeButton size='sm'>Upgrade to Pro</UpgradeButton>
            </div>
          </div>
        ) : null}
        <CrawlerRows
          loading={isLoading}
          crawlers={data?.crawlers ?? []}
          blurred={showTeaser}
        />
        {data?.syncedAt ? (
          <p className='mt-3 text-3xs text-tertiary-token'>
            Updated {new Date(data.syncedAt).toLocaleString()}
          </p>
        ) : (
          <p className='mt-3 text-3xs text-tertiary-token'>
            Refreshes daily from Cloudflare edge analytics.
          </p>
        )}
      </DrawerSurfaceCard>
    </EntitySidebarShell>
  );
}
