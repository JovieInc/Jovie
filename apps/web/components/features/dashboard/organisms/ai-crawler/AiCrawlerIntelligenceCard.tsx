'use client';

import { Bot, Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { EntityCard } from '@/components/organisms/entity-card';
import { aiCrawlerAnalyticsToEntityCard } from '@/components/organisms/entity-card/adapters';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { track } from '@/lib/analytics';
import { useAiCrawlerAnalyticsQuery } from '@/lib/queries/useAiCrawlerAnalyticsQuery';
import { cn } from '@/lib/utils';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

interface AiCrawlerIntelligenceCardProps {
  readonly onOpenDetail?: () => void;
  readonly className?: string;
}

function CardSkeleton({ className }: { readonly className?: string }) {
  return (
    <div
      className={cn('min-h-45 rounded-2xl border border-subtle bg-surface-1 p-4', className)}
      data-testid='ai-crawler-card-skeleton'
    >
      <LoadingSkeleton height='h-4' width='w-28' rounded='sm' className='mb-3' />
      <LoadingSkeleton height='h-8' width='w-20' rounded='sm' className='mb-4' />
      <div className='space-y-2'>
        <LoadingSkeleton height='h-3' width='w-full' rounded='sm' />
        <LoadingSkeleton height='h-3' width='w-4/5' rounded='sm' />
        <LoadingSkeleton height='h-3' width='w-3/5' rounded='sm' />
      </div>
    </div>
  );
}

function TeaserOverlay({
  analytics,
}: {
  readonly analytics: AiCrawlerAnalyticsResponse;
}) {
  return (
    <div
      className='absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,transparent)] px-4 text-center backdrop-blur-[2px]'
      data-testid='ai-crawler-card-teaser'
    >
      <div className='flex h-9 w-9 items-center justify-center rounded-full bg-surface-0 text-secondary-token'>
        <Lock className='h-4 w-4' aria-hidden='true' />
      </div>
      <div className='space-y-1'>
        <p className='text-app font-semibold text-primary-token'>
          {analytics.totalRequests > 0
            ? `${analytics.totalRequests.toLocaleString()} AI reads in 30 days`
            : 'See which AI services read your pages'}
        </p>
        <p className='text-xs text-secondary-token'>
          Upgrade to Pro for named crawlers, counts, and trends.
        </p>
      </div>
      <UpgradeButton size='sm'>Upgrade to Pro</UpgradeButton>
    </div>
  );
}

export function AiCrawlerIntelligenceCard({
  onOpenDetail,
  className,
}: AiCrawlerIntelligenceCardProps) {
  const { data, isLoading, isError } = useAiCrawlerAnalyticsQuery();
  const hasTrackedViewRef = useRef(false);

  useEffect(() => {
    if (!data || hasTrackedViewRef.current) {
      return;
    }

    track('ai_crawler_card_viewed', {
      is_pro: data.isPro,
      is_teaser: data.isTeaser,
      total_requests: data.totalRequests,
      crawler_count: data.crawlers.length,
    });
    hasTrackedViewRef.current = true;
  }, [data]);

  if (isLoading) {
    return <CardSkeleton className={className} />;
  }

  if (isError || !data) {
    return (
      <div
        className={cn(
          'min-h-45 rounded-2xl border border-subtle bg-surface-1 p-4',
          className
        )}
        data-testid='ai-crawler-card-error'
      >
        <div className='flex items-center gap-2 text-secondary-token'>
          <Bot className='h-4 w-4' aria-hidden='true' />
          <p className='text-app'>AI crawler analytics temporarily unavailable.</p>
        </div>
      </div>
    );
  }

  const model = aiCrawlerAnalyticsToEntityCard(data);
  const showTeaser = data.isTeaser;

  return (
    <div
      className={cn('relative min-h-45', className)}
      data-testid='ai-crawler-intelligence-card'
    >
      <EntityCard
        model={model}
        treatment='detailed'
        surface='app'
        className={cn(showTeaser && 'pointer-events-none select-none blur-[3px]')}
        onClick={
          !showTeaser
            ? () => {
                track('ai_crawler_card_opened', {
                  total_requests: data.totalRequests,
                  crawler_count: data.crawlers.length,
                });
                onOpenDetail?.();
              }
            : undefined
        }
        dataTestId='ai-crawler-entity-card'
      />
      {showTeaser ? <TeaserOverlay analytics={data} /> : null}
    </div>
  );
}