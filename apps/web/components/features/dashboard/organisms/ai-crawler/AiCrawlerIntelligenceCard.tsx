'use client';

import { ChevronRight, Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { aiCrawlerAnalyticsToEntityCard } from '@/components/organisms/entity-card/adapters';
import {
  KIND_PRESETS,
  statusDotVar,
} from '@/components/organisms/entity-card/kind-presets';
import { track } from '@/lib/analytics';
import { useAiCrawlerAnalyticsQuery } from '@/lib/queries/useAiCrawlerAnalyticsQuery';
import { cn } from '@/lib/utils';

interface AiCrawlerIntelligenceCardProps {
  readonly onOpenDetail?: () => void;
  readonly className?: string;
}

const ROW_CLASS =
  'flex min-h-12 w-full items-center gap-3 rounded-xl border border-subtle bg-surface-1 px-3 py-2';

function RowSkeleton({ className }: { readonly className?: string }) {
  return (
    <div
      className={cn(ROW_CLASS, className)}
      data-testid='ai-crawler-card-skeleton'
    >
      <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
      <LoadingSkeleton height='h-4' width='w-24' rounded='sm' />
      <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
    </div>
  );
}

export function AiCrawlerIntelligenceCard({
  onOpenDetail,
  className,
}: AiCrawlerIntelligenceCardProps) {
  const { data, isLoading, isError } = useAiCrawlerAnalyticsQuery();
  const hasTrackedViewRef = useRef(false);
  const BotIcon = KIND_PRESETS.ai.icon;

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
    return <RowSkeleton className={className} />;
  }

  if (isError || !data) {
    return (
      <div
        className={cn(ROW_CLASS, className)}
        data-testid='ai-crawler-card-error'
      >
        <BotIcon
          className='h-4 w-4 shrink-0 text-tertiary-token'
          aria-hidden='true'
        />
        <p className='min-w-0 truncate text-app text-secondary-token'>
          AI crawler analytics temporarily unavailable.
        </p>
      </div>
    );
  }

  const handleOpen = () => {
    track('ai_crawler_card_opened', {
      total_requests: data.totalRequests,
      crawler_count: data.crawlers.length,
    });
    onOpenDetail?.();
  };

  const model = aiCrawlerAnalyticsToEntityCard(data, {
    onOpenDetail: handleOpen,
  });
  const showTeaser = data.isTeaser;

  const rowContent = (
    <>
      {showTeaser ? (
        <Lock
          className='h-4 w-4 shrink-0 text-tertiary-token'
          aria-hidden='true'
        />
      ) : (
        <BotIcon
          className='h-4 w-4 shrink-0 text-secondary-token'
          aria-hidden='true'
        />
      )}
      <span className='shrink-0 text-sm font-semibold text-primary-token'>
        AI Visibility
      </span>
      <span className='min-w-0 flex-1 truncate text-left text-2xs text-tertiary-token'>
        {showTeaser
          ? 'See which AI services read your pages'
          : `${model.title} · ${model.meta}`}
      </span>
      {model.status ? (
        <span className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-3xs font-medium uppercase tracking-wide text-secondary-token'>
          <span
            className='h-1.5 w-1.5 shrink-0 rounded-full'
            style={{ background: statusDotVar(model.status.tone) }}
            aria-hidden='true'
          />
          {model.status.label}
        </span>
      ) : null}
    </>
  );

  if (showTeaser) {
    return (
      <div
        className={cn(ROW_CLASS, className)}
        data-testid='ai-crawler-intelligence-card'
      >
        <div
          className='flex min-w-0 flex-1 items-center gap-3'
          data-testid='ai-crawler-card-teaser'
        >
          {rowContent}
        </div>
        <UpgradeButton size='sm'>Upgrade to Pro</UpgradeButton>
      </div>
    );
  }

  return (
    <button
      type='button'
      onClick={handleOpen}
      className={cn(
        ROW_CLASS,
        'text-left transition-colors duration-subtle hover:border-default hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)',
        className
      )}
      data-testid='ai-crawler-intelligence-card'
      aria-label='View AI visibility details'
    >
      {rowContent}
      <ChevronRight
        className='h-4 w-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
    </button>
  );
}
