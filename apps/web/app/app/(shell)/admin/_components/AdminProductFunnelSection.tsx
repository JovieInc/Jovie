import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { formatPercent } from '@/lib/admin/format';
import {
  getAdminProductFunnelDashboard,
  type ProductFunnelTimeRange,
} from '@/lib/admin/product-funnel';

interface AdminProductFunnelSectionProps {
  readonly timeRange?: ProductFunnelTimeRange;
}

function formatTimestamp(value: Date | null): string {
  if (!value) return '—';
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildRangeHref(timeRange: ProductFunnelTimeRange): string {
  return `${APP_ROUTES.ADMIN}?view=scoreboard&funnelRange=${timeRange}`;
}

export async function AdminProductFunnelSection({
  timeRange = '24h',
}: Readonly<AdminProductFunnelSectionProps>) {
  const dashboard = await getAdminProductFunnelDashboard(timeRange);

  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Product Funnel'
        subtitle='Visit to retention'
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        actions={
          <div className='flex items-center gap-1'>
            {(['24h', '7d', '30d'] as const).map(range => (
              <Link
                key={range}
                href={buildRangeHref(range)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  range === dashboard.timeRange
                    ? 'bg-surface-1 text-primary-token'
                    : 'text-tertiary-token'
                }`}
              >
                {range}
              </Link>
            ))}
          </div>
        }
      />

      <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        <div className='flex flex-wrap gap-2'>
          {dashboard.activeAlerts.length > 0 ? (
            dashboard.activeAlerts.map(alert => (
              <div
                key={alert.ruleName}
                className='inline-flex items-center gap-2 rounded-full border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/8 px-3 py-1.5 text-[12px] text-primary-token'
              >
                <AlertTriangle className='h-3.5 w-3.5 text-error' />
                <span>{alert.reason}</span>
              </div>
            ))
          ) : (
            <div className='inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-[12px] text-secondary-token'>
              <CheckCircle2 className='h-3.5 w-3.5 text-success' />
              <span>No active alerts</span>
            </div>
          )}
        </div>

        <div className='flex gap-3 overflow-x-auto'>
          {dashboard.stages.map(stage => (
            <div
              key={stage.key}
              className='min-w-[132px] rounded-[16px] border border-subtle bg-surface-1 px-3 py-3'
            >
              <p className='text-[11px] font-[560] text-tertiary-token'>
                {stage.label}
              </p>
              <p className='mt-1 text-[24px] font-[620] leading-none tracking-[-0.03em] text-primary-token tabular-nums'>
                {stage.count.toLocaleString('en-US')}
              </p>
              <p className='mt-1 text-[12px] text-secondary-token'>
                {stage.conversionRate === null
                  ? 'Top of funnel'
                  : `${formatPercent(stage.conversionRate)} from prev`}
              </p>
              <p className='mt-0.5 text-[11px] text-tertiary-token'>
                {stage.dropOff === null
                  ? '—'
                  : `${stage.dropOff.toLocaleString('en-US')} drop-off`}
              </p>
            </div>
          ))}
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='rounded-[16px] border border-subtle bg-surface-1 px-3 py-3'>
            <p className='text-[11px] font-[560] text-tertiary-token'>
              Profile Engaged Day 1
            </p>
            <p className='mt-1 text-[22px] font-[620] leading-none tracking-[-0.03em] text-primary-token tabular-nums'>
              {dashboard.externalEngagement.profileEngagedDay1.toLocaleString(
                'en-US'
              )}
            </p>
            <p className='mt-1 text-[12px] text-secondary-token'>
              Public profile activity after activation
            </p>
          </div>
          <div className='rounded-[16px] border border-subtle bg-surface-1 px-3 py-3'>
            <p className='text-[11px] font-[560] text-tertiary-token'>
              Profile Engaged Day 7
            </p>
            <p className='mt-1 text-[22px] font-[620] leading-none tracking-[-0.03em] text-primary-token tabular-nums'>
              {dashboard.externalEngagement.profileEngagedDay7.toLocaleString(
                'en-US'
              )}
            </p>
            <p className='mt-1 text-[12px] text-secondary-token'>
              Public profile activity after activation
            </p>
          </div>
        </div>

        <div className='grid gap-2 text-[12px] text-secondary-token sm:grid-cols-2 xl:grid-cols-4'>
          <p>
            Synthetic Signup: {dashboard.syntheticMonitor.status}{' '}
            {dashboard.syntheticMonitor.lastStartedAt
              ? `(${formatTimestamp(dashboard.syntheticMonitor.lastStartedAt)})`
              : ''}
          </p>
          <p>
            Latest Payment:{' '}
            {formatTimestamp(dashboard.latestPaymentSucceededAt)}
          </p>
          <p>
            Latest Retention:{' '}
            {formatTimestamp(dashboard.latestRetentionMaterializedAt)}
          </p>
          <p>Started: {formatTimestamp(dashboard.dataCollectionStartedAt)}</p>
        </div>

        <p className='text-[11px] text-tertiary-token'>
          {dashboard.sentryReliabilityNote}
        </p>

        {dashboard.errors.length > 0 ? (
          <p className='text-[12px] text-error'>
            {dashboard.errors.join('; ')}
          </p>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

export function AdminProductFunnelSectionSkeleton() {
  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-32'
        descriptionWidth='w-28'
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
      />
      <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        <div className='h-8 w-48 animate-pulse rounded-full bg-surface-1' />
        <div className='flex gap-3 overflow-hidden'>
          {[
            'visit',
            'signup-started',
            'signup-completed',
            'onboarding-started',
            'activated',
            'payment-succeeded',
          ].map(stageKey => (
            <div
              key={stageKey}
              className='h-24 min-w-[132px] animate-pulse rounded-[16px] bg-surface-1'
            />
          ))}
        </div>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='h-24 animate-pulse rounded-[16px] bg-surface-1' />
          <div className='h-24 animate-pulse rounded-[16px] bg-surface-1' />
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
