'use client';

import * as Sentry from '@sentry/nextjs';
import { Globe, Link2, MapPin } from 'lucide-react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { DashboardRefreshButton } from '@/components/dashboard/atoms/DashboardRefreshButton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { AnalyticsFunnel } from './AnalyticsFunnel';
import { RangeToggle } from './RangeToggle';
import { useDashboardAnalyticsState } from './useDashboardAnalytics';

const LOADING_SKELETON_COUNT = 5;
const LOADING_SKELETON_KEYS = Array.from(
  { length: LOADING_SKELETON_COUNT },
  (_, i) => `loading-${i}`
);

function formatLinkType(linkType: string): string {
  const typeMap: Record<string, string> = {
    listen: 'Listen Link',
    social: 'Social Link',
    other: 'Other Link',
  };
  return typeMap[linkType] || linkType;
}

export function DashboardAnalytics() {
  const {
    artist,
    range,
    setRange,
    rangeTabsBaseId,
    rangePanelId,
    activeRangeTabId,
    data,
    error,
    loading,
    refresh,
    rangeLabel,
  } = useDashboardAnalyticsState();

  if (!artist) return null;

  return (
    <div className='space-y-8'>
      {/* Header */}
      <div className='flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-primary-token'>
            Analytics
          </h1>
          <p className='text-secondary-token mt-1'>
            Track your audience growth and engagement
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <DashboardRefreshButton
            ariaLabel='Refresh analytics'
            onRefreshed={() => {
              refresh().catch(refreshError => {
                Sentry.captureException(refreshError);
              });
            }}
          />
          <RangeToggle
            value={range}
            onChange={setRange}
            tabsBaseId={rangeTabsBaseId}
            panelId={rangePanelId}
          />
        </div>
      </div>

      <div
        id={rangePanelId}
        role='tabpanel'
        aria-labelledby={activeRangeTabId}
        className='space-y-8'
      >
        {/* Hero Funnel Section */}
        <DashboardCard variant='analytics' className='p-8'>
          <div className='text-center mb-8'>
            <h2 className='text-lg font-semibold text-primary-token'>
              Conversion Funnel
            </h2>
            <p className='text-sm text-secondary-token mt-1'>{rangeLabel}</p>
          </div>

          {loading ? (
            <div className='flex flex-col items-center gap-4'>
              <LoadingSkeleton height='h-24' width='w-full' rounded='lg' />
              <LoadingSkeleton height='h-20' width='w-3/4' rounded='lg' />
              <LoadingSkeleton height='h-16' width='w-1/2' rounded='lg' />
            </div>
          ) : (
            <AnalyticsFunnel
              profileViews={data?.profile_views ?? 0}
              uniqueUsers={data?.unique_users ?? 0}
              subscribers={data?.subscribers ?? 0}
            />
          )}

          {error && (
            <p className='mt-4 text-sm text-center text-destructive'>{error}</p>
          )}
        </DashboardCard>

        {/* Stats Grid */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          {/* Top Cities */}
          <DashboardCard variant='analytics' className='p-6'>
            <div className='flex items-center gap-2 mb-5'>
              <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-accent-subtle)]'>
                <MapPin className='h-4 w-4 text-accent' />
              </div>
              <h3 className='text-sm font-semibold text-primary-token'>
                Top Cities
              </h3>
            </div>

            {loading ? (
              <ul className='space-y-3' aria-hidden='true'>
                {LOADING_SKELETON_KEYS.map(key => (
                  <li key={key} className='flex items-center justify-between'>
                    <LoadingSkeleton height='h-4' width='w-28' rounded='md' />
                    <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className='space-y-3'>
                {(data?.top_cities ?? []).length > 0 ? (
                  data?.top_cities.map((c, index) => (
                    <li
                      key={c.city}
                      className='flex items-center justify-between group'
                    >
                      <div className='flex items-center gap-2'>
                        <span className='text-xs font-medium text-tertiary-token w-4'>
                          {index + 1}
                        </span>
                        <span className='text-sm text-secondary-token group-hover:text-primary-token transition-colors'>
                          {c.city}
                        </span>
                      </div>
                      <span className='text-sm font-semibold text-primary-token tabular-nums'>
                        {Intl.NumberFormat().format(c.count)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className='text-sm text-secondary-token py-4 text-center'>
                    No city data yet
                  </li>
                )}
              </ul>
            )}
          </DashboardCard>

          {/* Top Traffic Sources */}
          <DashboardCard variant='analytics' className='p-6'>
            <div className='flex items-center gap-2 mb-5'>
              <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-accent-subtle)]'>
                <Globe className='h-4 w-4 text-accent' />
              </div>
              <h3 className='text-sm font-semibold text-primary-token'>
                Traffic Sources
              </h3>
            </div>

            {loading ? (
              <ul className='space-y-3' aria-hidden='true'>
                {LOADING_SKELETON_KEYS.map(key => (
                  <li key={key} className='flex items-center justify-between'>
                    <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                    <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className='space-y-3'>
                {(data?.top_referrers ?? []).length > 0 ? (
                  data?.top_referrers.map((r, index) => (
                    <li
                      key={r.referrer || 'direct'}
                      className='flex items-center justify-between group'
                    >
                      <div className='flex items-center gap-2 min-w-0 flex-1'>
                        <span className='text-xs font-medium text-tertiary-token w-4'>
                          {index + 1}
                        </span>
                        <span className='text-sm text-secondary-token group-hover:text-primary-token transition-colors truncate'>
                          {r.referrer || 'Direct'}
                        </span>
                      </div>
                      <span className='text-sm font-semibold text-primary-token tabular-nums ml-2'>
                        {Intl.NumberFormat().format(r.count)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className='text-sm text-secondary-token py-4 text-center'>
                    No referrer data yet
                  </li>
                )}
              </ul>
            )}
          </DashboardCard>

          {/* Top Links */}
          <DashboardCard variant='analytics' className='p-6'>
            <div className='flex items-center gap-2 mb-5'>
              <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-accent-subtle)]'>
                <Link2 className='h-4 w-4 text-accent' />
              </div>
              <h3 className='text-sm font-semibold text-primary-token'>
                Top Links
              </h3>
            </div>

            {loading ? (
              <ul className='space-y-3' aria-hidden='true'>
                {LOADING_SKELETON_KEYS.map(key => (
                  <li key={key} className='flex items-center justify-between'>
                    <LoadingSkeleton height='h-4' width='w-28' rounded='md' />
                    <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className='space-y-3'>
                {(data?.top_links ?? []).length > 0 ? (
                  data?.top_links?.map((link, index) => (
                    <li
                      key={link.id}
                      className='flex items-center justify-between group'
                    >
                      <div className='flex items-center gap-2 min-w-0 flex-1'>
                        <span className='text-xs font-medium text-tertiary-token w-4'>
                          {index + 1}
                        </span>
                        <span className='text-sm text-secondary-token group-hover:text-primary-token transition-colors truncate'>
                          {formatLinkType(link.url)}
                        </span>
                      </div>
                      <span className='text-sm font-semibold text-primary-token tabular-nums ml-2'>
                        {Intl.NumberFormat().format(link.clicks)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className='text-sm text-secondary-token py-4 text-center'>
                    No link data yet
                  </li>
                )}
              </ul>
            )}
          </DashboardCard>
        </div>

        {/* Additional Metrics Row */}
        {typeof data?.listen_clicks === 'number' &&
          typeof data?.identified_users === 'number' && (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
              <DashboardCard variant='analytics' className='p-5'>
                <p className='text-xs font-semibold uppercase tracking-[0.15em] text-tertiary-token'>
                  Capture Rate
                </p>
                <p className='mt-2 text-2xl font-bold tracking-tight text-primary-token'>
                  {data.capture_rate ?? 0}%
                </p>
                <p className='mt-1 text-xs text-secondary-token'>
                  Visitors to subscribers
                </p>
              </DashboardCard>

              <DashboardCard variant='analytics' className='p-5'>
                <p className='text-xs font-semibold uppercase tracking-[0.15em] text-tertiary-token'>
                  Listen Clicks
                </p>
                <p className='mt-2 text-2xl font-bold tracking-tight text-primary-token'>
                  {Intl.NumberFormat().format(data.listen_clicks)}
                </p>
                <p className='mt-1 text-xs text-secondary-token'>
                  {rangeLabel}
                </p>
              </DashboardCard>

              <DashboardCard variant='analytics' className='p-5'>
                <p className='text-xs font-semibold uppercase tracking-[0.15em] text-tertiary-token'>
                  Identified Users
                </p>
                <p className='mt-2 text-2xl font-bold tracking-tight text-primary-token'>
                  {Intl.NumberFormat().format(data.identified_users)}
                </p>
                <p className='mt-1 text-xs text-secondary-token'>
                  {rangeLabel}
                </p>
              </DashboardCard>

              <DashboardCard variant='analytics' className='p-5'>
                <p className='text-xs font-semibold uppercase tracking-[0.15em] text-tertiary-token'>
                  Total Clicks
                </p>
                <p className='mt-2 text-2xl font-bold tracking-tight text-primary-token'>
                  {Intl.NumberFormat().format(data.total_clicks ?? 0)}
                </p>
                <p className='mt-1 text-xs text-secondary-token'>All time</p>
              </DashboardCard>
            </div>
          )}
      </div>
    </div>
  );
}
