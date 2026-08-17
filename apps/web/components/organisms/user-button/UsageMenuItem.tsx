'use client';

import { Button } from '@jovie/ui';
import { ChevronDown, ChevronRight, ExternalLink, Gauge } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { UsageMeter } from '@/components/molecules/UsageMeter';
import { APP_ROUTES } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import { formatResetAt, getWeeklyUsageModel } from '@/lib/chat-usage/metrics';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface UsageMenuItemProps {
  readonly usageStatsUrl: string;
  readonly onUpgrade?: () => void;
  readonly upgradeLabel?: string;
  readonly isUpgradeLoading?: boolean;
}

export function UsageMenuItem({
  usageStatsUrl,
  onUpgrade,
  upgradeLabel = 'Upgrade to Pro',
  isUpgradeLoading = false,
}: UsageMenuItemProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const chatUsage = useChatUsageQuery({
    enabled: !env.IS_E2E,
  });
  const weeklyModel = chatUsage.data
    ? getWeeklyUsageModel(chatUsage.data)
    : null;
  const copy = chatUsage.data ? getChatUsageCopy(chatUsage.data) : null;
  const showUpgradeNudge =
    copy?.state === 'near_limit' || copy?.state === 'exhausted';
  const isLoading = chatUsage.isLoading;
  const isStale = chatUsage.data?._stale === true;
  const hasAnyData = Boolean(chatUsage.data);

  const toggleExpanded = () => {
    setExpanded(current => !current);
  };

  return (
    <div data-testid='usage-menu-item'>
      <Button
        type='button'
        variant='ghost'
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className='min-h-8 w-full justify-start gap-2 rounded-none px-2.5 py-1.5 text-left text-app font-normal text-secondary-token hover:text-secondary-token focus-visible:bg-interactive-hover'
      >
        <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
          <Gauge className='h-4 w-4' aria-hidden />
        </span>
        <span className='min-w-0 flex-1'>Usage remaining</span>
        <span className='shrink-0 tabular-nums text-tertiary-token'>
          {isLoading ? (
            <span
              className='inline-block h-3 w-8 animate-pulse rounded bg-surface-2 motion-reduce:animate-none'
              aria-hidden
            />
          ) : weeklyModel === null ? (
            '—'
          ) : (
            `${weeklyModel.remainingPercent}%`
          )}
        </span>
        {expanded ? (
          <ChevronDown className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        ) : (
          <ChevronRight className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        )}
      </Button>

      {expanded ? (
        <div id={detailsId} className='pb-2'>
          <div className='flex items-center justify-between px-2.5 pb-1 pt-2 text-2xs text-tertiary-token'>
            <span>{copy?.planLabel ?? 'Plan'} usage</span>
            <span>{isStale ? 'Sync delayed' : 'Updated now'}</span>
          </div>

          {weeklyModel ? (
            <UsageMeter
              density='compact'
              label='Weekly Messages'
              model={weeklyModel}
              resetLabel={`Resets ${formatResetAt(weeklyModel.resetAt)}`}
            />
          ) : null}

          {!hasAnyData ? (
            <p className='px-2.5 py-2 text-2xs text-tertiary-token'>
              {isLoading
                ? 'Loading usage…'
                : 'Usage details are unavailable right now.'}
            </p>
          ) : null}

          {hasAnyData && !weeklyModel ? (
            <p className='px-2.5 py-1 text-2xs text-tertiary-token'>
              Usage details could not be verified.
            </p>
          ) : null}

          {showUpgradeNudge && copy ? (
            <div className='px-2.5 pt-1'>
              {chatUsage.data?.plan === 'free' && onUpgrade ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='h-7 w-full justify-center text-2xs'
                  onClick={onUpgrade}
                  disabled={isUpgradeLoading}
                >
                  {isUpgradeLoading ? 'Opening…' : upgradeLabel}
                </Button>
              ) : (
                <Button
                  asChild
                  variant='secondary'
                  size='sm'
                  className='h-7 w-full justify-center text-2xs'
                >
                  <Link href={APP_ROUTES.PRICING}>{copy.ctaLabel}</Link>
                </Button>
              )}
            </div>
          ) : null}

          <div className='px-2.5 pt-1'>
            <Link
              href={usageStatsUrl}
              className={cn(
                'inline-flex items-center gap-1 text-2xs text-secondary-token transition-colors hover:text-primary-token'
              )}
            >
              Learn more
              <ExternalLink className='h-3 w-3' aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
