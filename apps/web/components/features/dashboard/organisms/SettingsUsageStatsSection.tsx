'use client';

import { Badge, Button } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { APP_ROUTES } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { cn } from '@/lib/utils';

const USAGE_PANEL_MIN_HEIGHT_CLASS = 'min-h-[342px]';

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatResetAt(value: string | null | undefined): string {
  if (!value) return 'Reset timing unavailable';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return 'Reset timing unavailable';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(resetAt);
}

function getMonthlyUsage(data: ChatUsageData): {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly resetAt: string | null | undefined;
} {
  const limit = data.monthlyLimit ?? data.dailyLimit * 30;
  const used = data.monthlyUsed ?? data.used;

  return {
    limit,
    used,
    remaining: data.monthlyRemaining ?? Math.max(0, limit - used),
    resetAt: data.monthlyResetAt,
  };
}

interface UsageMeterRowProps {
  readonly title: string;
  readonly description: string;
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string | null | undefined;
}

function UsageMeterRow({
  title,
  description,
  used,
  limit,
  remaining,
  resetAt,
}: UsageMeterRowProps) {
  const clampedUsed = Math.min(Math.max(0, used), Math.max(0, limit));
  const progressMax = Math.max(1, limit);

  return (
    <div className='px-4 py-4 sm:px-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <p className='text-app font-caption text-primary-token'>{title}</p>
          <p className='text-xs leading-[17px] text-secondary-token'>
            {description}
          </p>
        </div>
        <div className='text-right text-xs leading-[17px] text-secondary-token'>
          <p className='font-caption text-primary-token'>
            {formatNumber(remaining)} left
          </p>
          <p>Resets {formatResetAt(resetAt)}</p>
        </div>
      </div>
      <div className='mt-3 h-2 rounded-full bg-surface-0'>
        <progress
          aria-label={`${title} usage`}
          value={clampedUsed}
          max={progressMax}
          className='block h-2 w-full appearance-none overflow-hidden rounded-full bg-surface-0 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary-token [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-0 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary-token'
        />
      </div>
      <p className='mt-2 text-2xs text-tertiary-token'>
        {formatNumber(clampedUsed)} of {formatNumber(limit)} messages used
      </p>
    </div>
  );
}

interface UsageSummaryRowProps {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}

function UsageSummaryRow({ label, value, detail }: UsageSummaryRowProps) {
  return (
    <div className='flex min-h-14 items-center justify-between gap-4 px-4 py-3 sm:px-5'>
      <div className='min-w-0'>
        <p className='text-xs font-caption text-primary-token'>{label}</p>
        {detail ? (
          <p className='mt-0.5 text-2xs leading-[15px] text-secondary-token'>
            {detail}
          </p>
        ) : null}
      </div>
      <p className='shrink-0 text-right text-xs font-caption text-primary-token'>
        {value}
      </p>
    </div>
  );
}

function UsageLoadingState() {
  return (
    <UsagePanelShell>
      <div className='border-b border-(--linear-app-frame-seam) px-4 py-4 sm:px-5'>
        <div className='h-4 w-32 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
        <div className='mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
      </div>
      <div className='divide-y divide-(--linear-app-frame-seam)'>
        {['daily', 'monthly'].map(key => (
          <div key={key} className='px-4 py-4 sm:px-5'>
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
        ))}
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
      <div className='mx-auto flex max-w-[28rem] flex-col items-center px-4 text-center'>
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
  const { data, isLoading, error } = useChatUsageQuery({
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

  if (isLoading) {
    return <UsageLoadingState />;
  }

  if (error) {
    return (
      <UsageMessageState
        title='Usage unavailable'
        description="We couldn't load your usage stats right now. Please refresh and try again."
      />
    );
  }

  if (!data) {
    return (
      <UsageMessageState
        title='No usage recorded'
        description='Message quota appears here after the first chat request in this billing window.'
      />
    );
  }

  const copy = getChatUsageCopy(data);
  const showUpgradeCta = copy.state !== 'healthy';
  const monthly = getMonthlyUsage(data);

  return (
    <UsagePanelShell>
      <div className='flex flex-wrap items-start justify-between gap-3 border-b border-(--linear-app-frame-seam) px-4 py-4 sm:px-5'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-app font-caption text-primary-token'>
              {copy.summaryTitle}
            </p>
            <Badge
              variant={copy.state === 'healthy' ? 'success' : 'warning'}
              size='sm'
              className='rounded-md px-1.5 text-3xs'
            >
              {copy.statusLabel}
            </Badge>
          </div>
          <p className='max-w-[42rem] text-xs leading-[17px] text-secondary-token'>
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

      <div className='divide-y divide-(--linear-app-frame-seam)'>
        <UsageMeterRow
          title='Daily Messages'
          description='Quota for the current 24-hour window.'
          used={data.used}
          limit={data.dailyLimit}
          remaining={data.remaining}
          resetAt={data.resetAt}
        />
        <UsageMeterRow
          title='Monthly Capacity'
          description='Plan capacity across the current calendar month.'
          used={monthly.used}
          limit={monthly.limit}
          remaining={monthly.remaining}
          resetAt={monthly.resetAt}
        />
      </div>

      <div className='mt-auto divide-y divide-(--linear-app-frame-seam) border-t border-(--linear-app-frame-seam)'>
        <UsageSummaryRow
          label='Plan'
          value={copy.planLabel}
          detail='Current chat entitlement'
        />
        <UsageSummaryRow
          label='Remaining Today'
          value={formatNumber(data.remaining)}
          detail={`${formatNumber(data.dailyLimit)} daily messages included`}
        />
      </div>
    </UsagePanelShell>
  );
}
