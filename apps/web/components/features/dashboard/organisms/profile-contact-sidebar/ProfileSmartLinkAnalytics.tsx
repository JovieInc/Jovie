'use client';

import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/components/feedback';
import {
  DrawerEmptyState,
  DrawerInlineIconButton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { copyToClipboard } from '@/hooks/useClipboard';
import { CANONICAL_METRICS } from '@/lib/analytics/metrics';
import { getTimeRangeLabel } from '@/lib/analytics/time-range';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

const numberFormatter = new Intl.NumberFormat();

interface ProfileSmartLinkAnalyticsProps {
  readonly profileUrl: string;
  readonly variant?: 'card' | 'flat';
}

function ProfileSmartLinkControl({
  profileUrl,
}: {
  readonly profileUrl: string;
}) {
  const smartLinkLabel = profileUrl.replace(/^https?:\/\//u, '');

  return (
    <div
      className='flex h-9 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-3'
      data-testid='profile-smart-link-control'
    >
      <Link2
        className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <span
        className='min-w-0 flex-1 truncate font-mono text-3xs leading-none tracking-[-0.01em] text-secondary-token'
        title={profileUrl}
      >
        {smartLinkLabel}
      </span>
      <DrawerInlineIconButton
        onClick={async event => {
          event.stopPropagation();
          const copied = await copyToClipboard(profileUrl);
          if (copied) {
            toast.success('Profile link copied');
            return;
          }
          toast.error('Failed to copy link');
        }}
        title='Copy profile link'
        className='h-6 w-6 rounded-full text-tertiary-token'
      >
        <Copy className='h-3.5 w-3.5' />
      </DrawerInlineIconButton>
      <DrawerInlineIconButton
        onClick={event => {
          event.stopPropagation();
          globalThis.open(profileUrl, '_blank', 'noopener,noreferrer');
        }}
        title='Open profile link'
        className='h-6 w-6 rounded-full text-tertiary-token'
      >
        <ExternalLink className='h-3.5 w-3.5' />
      </DrawerInlineIconButton>
    </div>
  );
}

export function ProfileSmartLinkAnalytics({
  profileUrl,
  variant = 'card',
}: ProfileSmartLinkAnalyticsProps) {
  const [range] = useState<AnalyticsRange>('30d');
  const { data, isLoading, isFetching, isError } = useDashboardAnalyticsQuery({
    range,
    view: 'traffic',
  });

  const profileViews = data?.profile_views ?? 0;
  const totalClicks = data?.total_clicks ?? 0;

  const showSkeleton = isLoading && !data;

  const currentRangeLabel = getTimeRangeLabel(range, 'description');

  const content = (
    <>
      {/* Analytics metrics */}
      <div className='min-h-19 px-3 pb-3 pt-3'>
        {showSkeleton && (
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <div className='h-2 w-12 rounded skeleton' />
              <div className='h-4 w-8 rounded skeleton' />
              <div className='h-2 w-10 rounded skeleton' />
            </div>
            <div className='space-y-1'>
              <div className='h-2 w-12 rounded skeleton' />
              <div className='h-4 w-8 rounded skeleton' />
              <div className='h-2 w-10 rounded skeleton' />
            </div>
          </div>
        )}

        {!showSkeleton && isError && (
          <DrawerEmptyState
            className='min-h-13 px-0 py-0'
            message='Analytics unavailable'
          />
        )}

        {!showSkeleton && !isError && (
          <div
            className={cn(
              'space-y-1.5 transition-opacity duration-subtle',
              isFetching && 'opacity-50'
            )}
          >
            <div className='grid grid-cols-2 gap-3'>
              <AnalyticsMetric
                label={CANONICAL_METRICS.profile_views.label}
                value={numberFormatter.format(profileViews)}
              />
              {/* Display alias for CANONICAL_METRICS.total_clicks */}
              <AnalyticsMetric
                label='Link Clicks'
                value={numberFormatter.format(totalClicks)}
              />
            </div>
            <p className='text-3xs leading-[13px] text-tertiary-token'>
              {currentRangeLabel}
            </p>
          </div>
        )}
      </div>

      {/* Smart link control */}
      <div className='px-3 pb-3 pt-0'>
        <ProfileSmartLinkControl profileUrl={profileUrl} />
      </div>
    </>
  );

  if (variant === 'flat') {
    return <div data-testid='profile-smart-link-analytics'>{content}</div>;
  }

  return (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
      testId='profile-smart-link-analytics'
    >
      {content}
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
  readonly hint?: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('space-y-px', className)}>
      <p className='text-3xs font-medium leading-[14px] text-tertiary-token'>
        {label}
      </p>
      <p className='tabular-nums text-lg font-semibold leading-none tracking-[-0.02em] text-primary-token'>
        {value}
      </p>
      {hint ? (
        <p className='text-3xs leading-[13px] text-tertiary-token'>{hint}</p>
      ) : null}
    </div>
  );
}
