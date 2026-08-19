'use client';

import { Button } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { UsageMeter } from '@/components/molecules/UsageMeter';
import { APP_ROUTES } from '@/constants/routes';
import type { ChatUsageState } from '@/lib/chat-usage/copy';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import { formatResetAt, getWeeklyUsageModel } from '@/lib/chat-usage/metrics';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const USAGE_PANEL_MIN_HEIGHT_CLASS = 'min-h-96';

interface UsagePanelShellProps {
  readonly children: ReactNode;
  readonly className?: string;
}

function UsagePanelShell({ children, className }: UsagePanelShellProps) {
  return (
    <SettingsPanel cardClassName='border border-subtle bg-surface-1 shadow-none'>
      <div
        className={cn(USAGE_PANEL_MIN_HEIGHT_CLASS, 'flex flex-col', className)}
        data-testid='settings-usage-panel'
      >
        {children}
      </div>
    </SettingsPanel>
  );
}

function getStatusToneClasses(state: ChatUsageState): string {
  if (state === 'healthy') {
    return 'border-success/25 bg-success/10 text-success';
  }

  if (state === 'near_limit') {
    return 'border-warning/25 bg-warning/10 text-warning';
  }

  if (state === 'exhausted') {
    return 'border-error/25 bg-error/10 text-error';
  }

  return 'border-subtle bg-surface-0 text-secondary-token';
}

function UsageLoadingState() {
  return (
    <UsagePanelShell>
      <div className='border-b border-subtle px-4 py-4 sm:px-5'>
        <div className='h-4 w-32 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
        <div className='mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
      </div>
      <div className='px-4 py-4 sm:px-5'>
        <div className='flex justify-between gap-4'>
          <div className='space-y-2'>
            <div className='h-3 w-28 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
            <div className='h-3 w-44 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
          </div>
          <div className='h-3 w-24 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
        </div>
        <div className='mt-3 h-2 rounded-full bg-surface-0'>
          <div className='h-2 w-1/3 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none' />
        </div>
      </div>
    </UsagePanelShell>
  );
}

function UsageMessageState({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <UsagePanelShell className='justify-center'>
      <div className='mx-auto flex max-w-md flex-col items-center px-4 text-center'>
        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-surface-0 text-secondary-token'>
          <AlertCircle className='h-4 w-4' aria-hidden />
        </div>
        <p className='mt-3 text-app font-caption text-primary-token'>{title}</p>
        <p className='mt-1 text-xs leading-[17px] text-secondary-token'>
          {description}
        </p>
      </div>
    </UsagePanelShell>
  );
}

export function SettingsUsageStatsSection() {
  const chatUsage = useChatUsageQuery({
    enabled: !env.IS_E2E,
  });
  if (env.IS_E2E) {
    return (
      <UsageMessageState
        title='Usage unavailable'
        description='Usage stats are unavailable in the passive runtime.'
      />
    );
  }

  if (chatUsage.isLoading) {
    return <UsageLoadingState />;
  }

  if (chatUsage.error) {
    return (
      <UsageMessageState
        title='Usage unavailable'
        description="We couldn't load your usage stats right now. Please refresh and try again."
      />
    );
  }

  if (!chatUsage.data) {
    return (
      <UsageMessageState
        title='No usage recorded'
        description='Message quota appears here after the first chat request in this billing window.'
      />
    );
  }

  const copy = chatUsage.data ? getChatUsageCopy(chatUsage.data) : null;
  const weeklyModel = chatUsage.data
    ? getWeeklyUsageModel(chatUsage.data)
    : null;
  const showUpgradeCta =
    copy?.state === 'near_limit' || copy?.state === 'exhausted';
  const isStale = chatUsage.data?._stale === true;
  const planLabel = copy?.planLabel ?? 'Current plan';

  return (
    <UsagePanelShell>
      <div className='flex flex-wrap items-start justify-between gap-3 border-b border-subtle px-4 py-4 sm:px-5'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-app font-caption text-primary-token'>
              {copy?.summaryTitle ?? 'Plan usage'}
            </p>
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-1.5 py-0.5 text-3xs font-medium tracking-wide',
                getStatusToneClasses(copy?.state ?? 'unavailable')
              )}
            >
              {planLabel}
            </span>
          </div>
          <p className='max-w-2xl text-xs leading-[17px] text-secondary-token'>
            {copy?.summaryDescription ??
              'Weekly AI message capacity for your current plan.'}
          </p>
        </div>
        {showUpgradeCta &&
          (chatUsage.data?.plan === 'free' ? (
            <UpgradeButton size='sm' variant='primary'>
              {copy?.ctaLabel}
            </UpgradeButton>
          ) : (
            <Button asChild size='sm' variant='secondary'>
              <Link href={APP_ROUTES.PRICING}>{copy?.ctaLabel}</Link>
            </Button>
          ))}
      </div>

      {isStale ? (
        <div className='border-b border-subtle px-4 py-3.5 sm:px-5'>
          <div className='flex items-start gap-2 text-warning'>
            <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
            <p className='text-app leading-[18px]'>
              Usage counts may be cached while billing syncs. Refresh in a
              moment for the latest quota.
            </p>
          </div>
        </div>
      ) : null}

      {!weeklyModel ? (
        <div className='border-b border-subtle px-4 py-2.5 text-2xs text-tertiary-token sm:px-5'>
          Usage details could not be verified and are hidden.
        </div>
      ) : null}

      <div>
        {weeklyModel ? (
          <UsageMeter
            label='Weekly Messages'
            description='AI messages remaining in the current seven-day window.'
            model={weeklyModel}
            resetLabel={`Resets ${formatResetAt(weeklyModel.resetAt)}`}
          />
        ) : null}
      </div>
    </UsagePanelShell>
  );
}
