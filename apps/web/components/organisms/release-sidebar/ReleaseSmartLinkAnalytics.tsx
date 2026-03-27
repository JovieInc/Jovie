'use client';

import { CommonDropdown } from '@jovie/ui';
import { Copy, ExternalLink, Link2, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DrawerEmptyState,
  DrawerInlineIconButton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { copyToClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareDropdownItems } from '@/lib/utm';
import type { Release, ReleaseSidebarAnalytics } from './types';

async function fetchReleaseAnalytics(
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseSidebarAnalytics> {
  const res = await fetch(
    `/api/dashboard/releases/${encodeURIComponent(releaseId)}/analytics`,
    { signal }
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
  const shareItems = useMemo(
    () =>
      getUTMShareDropdownItems({
        smartLinkUrl,
        context: buildUTMContext({
          smartLinkUrl,
          releaseSlug: release.slug,
          releaseTitle: release.title,
          artistName: artistName ?? release.artistNames?.[0],
          releaseDate: release.releaseDate,
        }),
      }),
    [
      artistName,
      release.artistNames,
      release.releaseDate,
      release.slug,
      release.title,
      smartLinkUrl,
    ]
  );

  return (
    <div className='space-y-1.5'>
      <div
        className='flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-2.5'
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
          className='h-5 w-5 rounded-full text-tertiary-token'
        >
          <Copy className='h-3 w-3' />
        </DrawerInlineIconButton>
        <DrawerInlineIconButton
          onClick={event => {
            event.stopPropagation();
            globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
          }}
          title='Open smart link'
          className='h-5 w-5 rounded-full text-tertiary-token'
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
              className='h-5 w-5 rounded-full text-tertiary-token'
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

  const showEmpty = !isLoading && !hasError && totalClicks === 0;

  const showSkeleton = isLoading && !data;

  return (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
      testId='release-smart-link-analytics'
    >
      {/* Analytics metrics */}
      <div className='px-3 pb-3 pt-3'>
        {showSkeleton && (
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <div className='h-[9px] w-12 rounded skeleton' />
              <div className='h-4 w-8 rounded skeleton' />
              <div className='h-[9px] w-10 rounded skeleton' />
            </div>
            <div className='space-y-1'>
              <div className='h-[9px] w-12 rounded skeleton' />
              <div className='h-4 w-8 rounded skeleton' />
              <div className='h-[9px] w-10 rounded skeleton' />
            </div>
          </div>
        )}

        {!showSkeleton && hasError && (
          <DrawerEmptyState
            className='min-h-[52px] px-0 py-0'
            message='Analytics unavailable'
          />
        )}

        {!showSkeleton && !hasError && (
          <div
            className={cn(
              'space-y-3 transition-opacity duration-100',
              isSwitching && 'opacity-50'
            )}
          >
            <div className='grid grid-cols-2 gap-3'>
              <AnalyticsMetric
                label='Total clicks'
                value={numberFormatter.format(totalClicks)}
                hint='All time'
              />
              <AnalyticsMetric
                label='Last 7 days'
                value={numberFormatter.format(last7DaysClicks)}
                hint='Recent'
              />
            </div>
          </div>
        )}
      </div>

      {release.smartLinkPath && (
        <div className='px-3 pb-3 pt-0'>
          <ReleaseSmartLinkControl
            release={release}
            artistName={artistName}
            helperText={
              showEmpty
                ? 'Share your smart link to start tracking clicks.'
                : undefined
            }
          />
        </div>
      )}
    </DrawerSurfaceCard>
  );
}

function AnalyticsMetric({
  label,
  value,
  hint,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('space-y-px', className)}>
      <p className='text-[10.5px] font-[500] leading-[14px] text-tertiary-token'>
        {label}
      </p>
      <p className='tabular-nums text-[18px] font-[590] leading-none tracking-[-0.02em] text-primary-token'>
        {value}
      </p>
      <p className='text-[10px] leading-[13px] text-tertiary-token'>{hint}</p>
    </div>
  );
}
