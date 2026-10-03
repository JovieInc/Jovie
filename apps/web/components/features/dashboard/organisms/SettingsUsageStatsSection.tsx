'use client';
// @coverage-via apps/web/tests/unit/dashboard/SettingsUsageStatsSection.test.tsx

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
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
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

function UsagePanelShell({
  children,
  planLabel,
  actions,
  resultRef,
}: Readonly<{
  children: ReactNode;
  planLabel?: string;
  actions?: ReactNode;
  resultRef?: Ref<HTMLElement>;
}>) {
  return (
    <SettingsPanel
      title='AI Message Usage'
      headerClassName='flex-col items-start sm:flex-row sm:items-center'
      description={planLabel}
      actions={actions}
      cardClassName='border border-subtle bg-surface-1 shadow-none'
    >
      <section
        className='min-h-28'
        data-testid='settings-usage-panel'
        ref={resultRef}
        aria-label='Weekly Usage'
        tabIndex={resultRef ? -1 : undefined}
      >
        {children}
      </section>
    </SettingsPanel>
  );
}

export function SettingsUsageStatsSection() {
  const chatUsage = useChatUsageQuery({ enabled: !env.IS_E2E });
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const retryInFlight = useRef(false);
  const [retryStartedWithSnapshot, setRetryStartedWithSnapshot] =
    useState(false);
  const [failedSnapshot, setFailedSnapshot] = useState<ChatUsageData>();
  const focusAfterRetry = useRef(false);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusAfterRetry.current || retrying) return;
    focusAfterRetry.current = false;
    if (
      chatUsage.data &&
      !chatUsage.error &&
      !chatUsage.data._stale &&
      getWeeklyUsageModel(chatUsage.data)
    ) {
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [chatUsage.data, chatUsage.error, retrying]);

  async function retry() {
    if (retryInFlight.current || chatUsage.isFetching) return;
    retryInFlight.current = true;
    setRetryStartedWithSnapshot(
      Boolean(chatUsage.data && getWeeklyUsageModel(chatUsage.data))
    );
    setFailedSnapshot(chatUsage.data);
    focusAfterRetry.current = false;
    setRetryFailed(false);
    setRetrying(true);
    try {
      const result = await chatUsage.refetch();
      const verified =
        result.data &&
        !result.error &&
        !result.data._stale &&
        getWeeklyUsageModel(result.data);
      setRetryFailed(!verified);
      focusAfterRetry.current = Boolean(
        verified && document.activeElement === retryButtonRef.current
      );
    } catch {
      setRetryFailed(true);
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  }
  const retryControl = (
    <Button
      ref={retryButtonRef}
      type='button'
      size='sm'
      variant='secondary'
      onClick={retry}
      aria-disabled={retrying || chatUsage.isFetching}
      aria-busy={retrying || chatUsage.isFetching}
    >
      {retrying ? 'Retrying…' : 'Retry'}
    </Button>
  );

  if (chatUsage.isLoading && !chatUsage.data && !retrying && !env.IS_E2E) {
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
  if (
    env.IS_E2E ||
    !chatUsage.data ||
    !weeklyModel ||
    (retrying && !retryStartedWithSnapshot)
  ) {
    return (
      <UsagePanelShell>
        <div className='space-y-2 px-4 py-4 sm:px-5'>
          <p role='alert' className='text-app font-caption text-primary-token'>
            Usage unavailable
          </p>
          <p className='text-xs text-secondary-token'>
            {env.IS_E2E
              ? 'Usage stats are unavailable in the passive runtime.'
              : retrying
                ? 'Checking your latest usage…'
                : 'The current message balance could not be verified.'}
          </p>
          {!env.IS_E2E && retryControl}
        </div>
      </UsagePanelShell>
    );
  }

  const copy = getChatUsageCopy(chatUsage.data);
  const isStale =
    chatUsage.data._stale === true ||
    Boolean(chatUsage.error) ||
    (retryFailed && failedSnapshot === chatUsage.data) ||
    retrying;
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
    <UsagePanelShell
      planLabel={`${copy.planLabel} plan`}
      actions={actions}
      resultRef={resultRef}
    >
      <UsageMeter
        label={isStale ? 'Last Known Weekly Messages' : 'Weekly Messages'}
        model={weeklyModel}
        resetLabel={formatUsageResetLabel(weeklyModel.resetAt)}
        showStatus={!isStale}
      />
      {isStale && (
        <div className='flex flex-wrap items-center justify-between gap-2 border-t border-subtle px-4 py-2 sm:px-5'>
          <p className='text-xs text-secondary-token' role='status'>
            {retrying
              ? 'Checking your latest usage…'
              : 'Usage may be out of date.'}
          </p>
          {retryControl}
        </div>
      )}
    </UsagePanelShell>
  );
}
