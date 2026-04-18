'use client';

import { CommonDropdown } from '@jovie/ui';
import { Copy, ExternalLink, Link2, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DrawerAnalyticsSummaryCard,
  DrawerInlineIconButton,
} from '@/components/molecules/drawer';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';
import { env } from '@/lib/env-client';
import { buildTrackedShareDropdownItems } from '@/lib/share/tracked-sources';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext } from '@/lib/utm';
import type { Release, ReleaseSidebarAnalytics } from './types';

function readCookieValue(cookieName: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookie = document.cookie
    .split(';')
    .map(entry => entry.trim())
    .find(entry => entry.startsWith(`${cookieName}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(cookieName.length + 1));
}

function getTestBypassHeaders(): Record<string, string> | undefined {
  const isDemoBypassEnabled =
    env.NEXT_PUBLIC_E2E_MODE === '1' || env.NEXT_PUBLIC_DEMO_RECORDING === '1';

  if (!isDemoBypassEnabled) {
    return undefined;
  }

  const mode = readCookieValue(TEST_MODE_COOKIE);
  const userId = readCookieValue(TEST_USER_ID_COOKIE);

  if (mode !== TEST_AUTH_BYPASS_MODE || !userId) {
    return undefined;
  }

  return {
    [TEST_MODE_HEADER]: mode,
    [TEST_USER_ID_HEADER]: userId,
  };
}

async function fetchReleaseAnalytics(
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseSidebarAnalytics> {
  const testBypassHeaders = getTestBypassHeaders();
  const res = await fetch(
    `/api/dashboard/releases/${encodeURIComponent(releaseId)}/analytics`,
    {
      cache: 'no-store',
      credentials: 'include',
      headers: testBypassHeaders,
      signal,
    }
  );

  if (!res.ok) {
    throw new Error('Failed to load release analytics');
  }

  return res.json() as Promise<ReleaseSidebarAnalytics>;
}

const numberFormatter = new Intl.NumberFormat();

interface ReleaseSmartLinkAnalyticsProps {
  readonly release: Release;
  readonly analyticsOverride?: ReleaseSidebarAnalytics | null;
  readonly artistName?: string | null;
  readonly variant?: 'card' | 'flat';
}

function getReleaseAnalyticsState({
  isLoading,
  hasError,
  data,
}: {
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly data: ReleaseSidebarAnalytics | null;
}) {
  const isInitialLoading = isLoading && !data;

  if (isInitialLoading) {
    return 'loading' as const;
  }

  if (hasError) {
    return 'error' as const;
  }

  return 'ready' as const;
}

function ReleaseSmartLinkControl({
  release,
  artistName,
  helperText,
}: {
  readonly release: Release;
  readonly artistName?: string | null;
  readonly helperText?: string;
}) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const smartLinkLabel = smartLinkUrl.replace(/^https?:\/\//u, '');
  const shareItems = useMemo(() => {
    const items = buildTrackedShareDropdownItems({
      baseUrl: smartLinkUrl,
      context: buildUTMContext({
        smartLinkUrl,
        releaseSlug: release.slug,
        releaseTitle: release.title,
        artistName: artistName ?? release.artistNames?.[0],
        releaseDate: release.releaseDate,
      }),
      onCopy: async (url, _label) => {
        const copied = await copyToClipboard(url);
        if (copied) {
          toast.success('Tracked link copied');
          return;
        }

        toast.error('Failed to copy link');
      },
    });

    if (items.length === 1 && items[0]?.type === 'submenu') {
      return items[0].items;
    }

    return items;
  }, [
    artistName,
    release.artistNames,
    release.releaseDate,
    release.slug,
    release.title,
    smartLinkUrl,
  ]);

  return (
    <div className='space-y-1.5'>
      <div
        className='flex h-9 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-2.5'
        data-testid='release-smart-link-control'
      >
        <Link2
          className='h-3 w-3 shrink-0 text-tertiary-token'
          aria-hidden='true'
        />
        <span
          className='min-w-0 flex-1 truncate font-mono text-[10.5px] leading-none tracking-[-0.01em] text-secondary-token'
          title={smartLinkUrl}
        >
          {smartLinkLabel}
        </span>
        <DrawerInlineIconButton
          onClick={async event => {
            event.stopPropagation();
            const copied = await copyToClipboard(smartLinkUrl);
            if (copied) {
              toast.success('Smart link copied');
              return;
            }
            toast.error('Failed to copy link');
          }}
          title='Copy smart link'
          className='h-7 w-7 rounded-full text-tertiary-token'
        >
          <Copy className='h-3 w-3' />
        </DrawerInlineIconButton>
        <DrawerInlineIconButton
          onClick={event => {
            event.stopPropagation();
            globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
          }}
          title='Open smart link'
          className='h-7 w-7 rounded-full text-tertiary-token'
        >
          <ExternalLink className='h-3 w-3' />
        </DrawerInlineIconButton>
        <CommonDropdown
          variant='dropdown'
          size='compact'
          align='end'
          items={shareItems}
          trigger={
            <DrawerInlineIconButton
              title='Share smart link'
              className='h-7 w-7 rounded-full text-tertiary-token'
            >
              <Share2 className='h-3 w-3' />
            </DrawerInlineIconButton>
          }
        />
      </div>
      {helperText ? (
        <p className='px-2.5 text-[10px] leading-[14px] text-tertiary-token'>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

export function ReleaseSmartLinkAnalytics({
  release,
  analyticsOverride,
  artistName,
  variant = 'card',
}: ReleaseSmartLinkAnalyticsProps) {
  const [data, setData] = useState<ReleaseSidebarAnalytics | null>(
    analyticsOverride ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (analyticsOverride) {
      setData(analyticsOverride);
      setIsLoading(false);
      setIsSwitching(false);
      setHasError(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(prev => (data === null ? true : prev));
    setIsSwitching(data !== null);
    setHasError(false);

    fetchReleaseAnalytics(release.id, controller.signal)
      .then(response => {
        if (!controller.signal.aborted) setData(response);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setHasError(true);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsSwitching(false);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data ref is intentionally stale to detect first-load vs switch
  }, [release.id, analyticsOverride]);

  const totalClicks = data?.totalClicks ?? 0;
  const last7DaysClicks = data?.last7DaysClicks ?? 0;

  const state = getReleaseAnalyticsState({ isLoading, hasError, data });

  return (
    <DrawerAnalyticsSummaryCard
      metrics={[
        {
          id: 'total-clicks',
          label: 'Total clicks',
          value: numberFormatter.format(totalClicks),
          hint: 'All time',
        },
        {
          id: 'last-7-days-clicks',
          label: 'Last 7 days',
          value: numberFormatter.format(last7DaysClicks),
          hint: 'Recent',
        },
      ]}
      state={state}
      dimmed={isSwitching}
      errorMessage='Analytics unavailable'
      testId='release-smart-link-analytics'
      variant={variant}
      footer={
        release.smartLinkPath ? (
          <ReleaseSmartLinkControl release={release} artistName={artistName} />
        ) : undefined
      }
    />
  );
}
