'use client';
// @coverage-via apps/web/tests/unit/dashboard/SettingsUsageStatsSection.test.tsx

import { Button } from '@jovie/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { UsageMeter } from '@/components/molecules/UsageMeter';
import { APP_ROUTES } from '@/constants/routes';
import { getChatUsageCopy } from '@/lib/chat-usage/copy';
import {
  formatUsageResetLabel,
  getWeeklyUsageModel,
} from '@/lib/chat-usage/metrics';
import { env } from '@/lib/env-client';
import { useChatUsageQuery } from '@/lib/queries';

function UsagePanelShell({
  children,
  planLabel,
  actions,
}: Readonly<{
  children: ReactNode;
  planLabel?: string;
  actions?: ReactNode;
}>) {
  return (
    <SettingsPanel
      title='AI Message Usage'
      headerClassName='flex-col items-start sm:flex-row sm:items-center'
      description={planLabel}
      actions={actions}
      cardClassName='border border-subtle bg-surface-1 shadow-none'
    >
      <div className='min-h-28' data-testid='settings-usage-panel'>
        {children}
      </div>
    </SettingsPanel>
  );
}

export function SettingsUsageStatsSection() {
  const chatUsage = useChatUsageQuery({ enabled: !env.IS_E2E });
  const retry = () => {
    void chatUsage.refetch();
  };

  if (chatUsage.isLoading && !env.IS_E2E) {
    return (
      <UsagePanelShell>
        <div
          className='space-y-4 px-4 py-4 sm:px-5'
          role='status'
          aria-label='Loading Usage'
        >
          <div className='h-4 w-32 animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
          <div className='h-2 w-full animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none' />
          <div className='h-3 w-48 max-w-full animate-pulse rounded bg-surface-2 motion-reduce:animate-none' />
        </div>
      </UsagePanelShell>
    );
  }

  const weeklyModel = chatUsage.data
    ? getWeeklyUsageModel(chatUsage.data)
    : null;
  if (env.IS_E2E || !chatUsage.data || !weeklyModel) {
    return (
      <UsagePanelShell>
        <div className='space-y-2 px-4 py-4 sm:px-5'>
          <p className='text-app font-caption text-primary-token'>
            Usage unavailable
          </p>
          <p className='text-xs text-secondary-token'>
            {env.IS_E2E
              ? 'Usage stats are unavailable in the passive runtime.'
              : 'The current message balance could not be verified.'}
          </p>
          {!env.IS_E2E && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={retry}
              disabled={chatUsage.isFetching}
            >
              Retry
            </Button>
          )}
        </div>
      </UsagePanelShell>
    );
  }

  const copy = getChatUsageCopy(chatUsage.data);
  const isStale = chatUsage.data._stale === true || Boolean(chatUsage.error);
  const showUpgradeCta =
    !isStale && (copy.state === 'near_limit' || copy.state === 'exhausted');
  const actions = showUpgradeCta ? (
    chatUsage.data.plan === 'free' ? (
      <UpgradeButton size='sm' variant='secondary'>
        {copy.ctaLabel}
      </UpgradeButton>
    ) : (
      <Button asChild size='sm' variant='secondary'>
        <Link href={APP_ROUTES.PRICING}>{copy.ctaLabel}</Link>
      </Button>
    )
  ) : (
    <Button asChild size='sm' variant='ghost'>
      <Link href={APP_ROUTES.SETTINGS_BILLING}>Manage Plan</Link>
    </Button>
  );

  return (
    <UsagePanelShell planLabel={`${copy.planLabel} plan`} actions={actions}>
      <UsageMeter
        label={isStale ? 'Last Known Weekly Messages' : 'Weekly Messages'}
        model={weeklyModel}
        resetLabel={formatUsageResetLabel(weeklyModel.resetAt)}
        showStatus={!isStale}
      />
      {isStale && (
        <div className='flex flex-wrap items-center justify-between gap-2 border-t border-subtle px-4 py-2 sm:px-5'>
          <p className='text-xs text-secondary-token' role='status'>
            Usage may be out of date.
          </p>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={retry}
            disabled={chatUsage.isFetching}
          >
            Retry
          </Button>
        </div>
      )}
    </UsagePanelShell>
  );
}
