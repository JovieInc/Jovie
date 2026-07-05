'use client';

import { Button } from '@jovie/ui';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import {
  formatUsageResetDate,
  formatUsageResetTime,
  getMonthlyUsage,
  getOverallRemainingPercent,
  getRemainingPercent,
} from '@/lib/chat-usage/metrics';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface UsageMenuItemProps {
  readonly usageStatsUrl: string;
  readonly onUpgrade?: () => void;
  readonly upgradeLabel?: string;
  readonly isUpgradeLoading?: boolean;
}

interface UsageWindowRowProps {
  readonly label: string;
  readonly remainingPercent: number;
  readonly resetLabel: string;
}

function UsageWindowRow({
  label,
  remainingPercent,
  resetLabel,
}: UsageWindowRowProps) {
  return (
    <div className='flex items-center justify-between gap-3 px-2.5 py-1.5 text-2xs text-secondary-token'>
      <span>{label}</span>
      <span className='tabular-nums text-tertiary-token'>
        {remainingPercent}% · {resetLabel}
      </span>
    </div>
  );
}

export function UsageMenuItem({
  usageStatsUrl,
  onUpgrade,
  upgradeLabel = 'Upgrade to Pro',
  isUpgradeLoading = false,
}: UsageMenuItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useChatUsageQuery({
    enabled: !env.IS_E2E,
  });

  const overallPercent =
    data !== undefined ? getOverallRemainingPercent(data) : null;
  const copy = data ? getChatUsageCopy(data) : null;
  const showUpgradeNudge = copy !== null && copy.state !== 'healthy';

  const toggleExpanded = () => {
    setExpanded(current => !current);
  };

  return (
    <div className='border-t border-subtle/60' data-testid='usage-menu-item'>
      <Button
        type='button'
        variant='ghost'
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className='h-auto w-full justify-start gap-2 rounded-none px-2.5 py-2 text-left text-app font-normal text-secondary-token hover:text-secondary-token focus-visible:bg-interactive-hover'
      >
        <span className='min-w-0 flex-1'>Usage remaining</span>
        <span className='shrink-0 tabular-nums text-tertiary-token'>
          {isLoading ? (
            <span
              className='inline-block h-3 w-8 animate-pulse rounded bg-surface-2 motion-reduce:animate-none'
              aria-hidden
            />
          ) : error || overallPercent === null ? (
            '—'
          ) : (
            `${overallPercent}%`
          )}
        </span>
        {expanded ? (
          <ChevronDown className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        ) : (
          <ChevronRight className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        )}
      </Button>

      {expanded ? (
        <div className='pb-2'>
          {data ? (
            <div className='space-y-0.5'>
              <UsageWindowRow
                label='Daily'
                remainingPercent={getRemainingPercent(
                  data.remaining,
                  data.dailyLimit
                )}
                resetLabel={formatUsageResetTime(data.resetAt)}
              />
              <UsageWindowRow
                label='Monthly'
                remainingPercent={getRemainingPercent(
                  getMonthlyUsage(data).remaining,
                  getMonthlyUsage(data).limit
                )}
                resetLabel={formatUsageResetDate(getMonthlyUsage(data).resetAt)}
              />
            </div>
          ) : (
            <p className='px-2.5 py-1.5 text-2xs text-tertiary-token'>
              {isLoading
                ? 'Loading usage…'
                : 'Usage details are unavailable right now.'}
            </p>
          )}

          {showUpgradeNudge && copy ? (
            <div className='px-2.5 pt-1'>
              {data?.plan === 'free' && onUpgrade ? (
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
