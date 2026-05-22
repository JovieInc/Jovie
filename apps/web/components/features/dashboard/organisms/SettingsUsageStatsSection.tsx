'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { APP_ROUTES } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';

interface UsageStatProps {
  readonly label: string;
  readonly value: string | number;
}

function UsageStat({ label, value }: UsageStatProps) {
  return (
    <div className='rounded-[14px] border border-subtle bg-surface-0 px-3 py-3'>
      <p className='text-2xs text-secondary-token'>{label}</p>
      <p className='mt-1 text-sm font-caption text-primary-token'>{value}</p>
    </div>
  );
}

export function SettingsUsageStatsSection() {
  const { data, isLoading, error } = useChatUsageQuery({
    enabled: !env.IS_E2E,
  });

  if (env.IS_E2E) {
    return (
      <p className='text-app text-secondary-token'>
        Usage stats are unavailable in the passive runtime.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        {['Plan', 'Daily Limit', 'Used', 'Remaining', 'Status'].map(label => (
          <div
            key={label}
            className='rounded-[14px] border border-subtle bg-surface-0 px-3 py-3'
          >
            <div className='h-3 w-16 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
            <div className='mt-2 h-4 w-20 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
          </div>
        ))}
      </div>
    );
  }

  if (!data || error) {
    return (
      <p className='text-app text-secondary-token'>
        We couldn&apos;t load your usage stats right now. Please refresh and try
        again.
      </p>
    );
  }

  const copy = getChatUsageCopy(data);
  const showUpgradeCta = copy.state !== 'healthy';

  return (
    <div className='space-y-4'>
      <div className='rounded-[16px] border border-subtle bg-surface-0 px-4 py-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='space-y-1'>
            <p className='text-sm font-caption text-primary-token'>
              {copy.summaryTitle}
            </p>
            <p className='max-w-[44rem] text-app text-secondary-token'>
              {copy.summaryDescription}
            </p>
          </div>
          {showUpgradeCta &&
            (data.plan === 'free' ? (
              <UpgradeButton size='sm' variant='primary'>
                {copy.ctaLabel}
              </UpgradeButton>
            ) : (
              <Button asChild size='sm' variant='secondary'>
                <Link href={APP_ROUTES.PRICING}>{copy.ctaLabel}</Link>
              </Button>
            ))}
        </div>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        <UsageStat label='Plan' value={copy.planLabel} />
        <UsageStat label='Daily Limit' value={data.dailyLimit} />
        <UsageStat label='Used' value={data.used} />
        <UsageStat label='Remaining' value={data.remaining} />
        <UsageStat label='Status' value={copy.statusLabel} />
      </div>
    </div>
  );
}
