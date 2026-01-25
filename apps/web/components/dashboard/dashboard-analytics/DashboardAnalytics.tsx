'use client';

import * as Sentry from '@sentry/nextjs';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { DashboardRefreshButton } from '@/components/dashboard/atoms/DashboardRefreshButton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { RangeToggle } from './RangeToggle';
import { useDashboardAnalyticsState } from './useDashboardAnalytics';

const LOADING_SKELETON_COUNT = 5;
const LOADING_SKELETON_KEYS = Array.from(
  { length: LOADING_SKELETON_COUNT },
  (_, i) => `loading-${i}`
);

/** Reusable metric card for the analytics grid */
function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <DashboardCard variant='analytics' className='p-6'>
      <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
        {label}
      </p>
      <p className='mt-3 text-3xl font-extrabold tracking-tight text-primary-token'>
        {value}
      </p>
      <p className='mt-2 text-xs text-secondary-token'>{subtitle}</p>
    </DashboardCard>
  );
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
    <div className='space-y-6'>
      <div className='flex items-start justify-between'>
        <div className='mb-2'>
          <h1 className='text-2xl font-bold text-primary-token'>Analytics</h1>
          <p className='text-secondary-token mt-1'>
            Track your profile performance
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
        className='space-y-6'
      >
        {/* Main card: Profile Views */}
        <DashboardCard variant='analytics' className='p-6'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='text-lg font-semibold text-primary-token'>
                Profile Views
              </h2>
              <p className='text-xs text-secondary-token mt-1'>{rangeLabel}</p>
            </div>
            {!loading && (
              <span className='text-4xl font-extrabold tracking-tight text-primary-token'>
                {Intl.NumberFormat().format(data?.profile_views ?? 0)}
              </span>
            )}
          </div>
          {loading && (
            <div className='mt-6'>
              <LoadingSkeleton height='h-8' width='w-40' rounded='md' />
            </div>
          )}
          {error && <p className='mt-4 text-sm text-destructive'>{error}</p>}
        </DashboardCard>

        {typeof data?.listen_clicks === 'number' &&
          typeof data?.subscribers === 'number' &&
          typeof data?.identified_users === 'number' && (
            <section className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <MetricCard
                label='Capture Rate'
                value={`${data.capture_rate ?? 0}%`}
                subtitle='Visitors → Subscribers'
              />
              <MetricCard
                label='Subscribers'
                value={Intl.NumberFormat().format(data.subscribers)}
                subtitle={rangeLabel}
              />
              <MetricCard
                label='Listen clicks'
                value={Intl.NumberFormat().format(data.listen_clicks)}
                subtitle={rangeLabel}
              />
              <MetricCard
                label='Identified'
                value={Intl.NumberFormat().format(data.identified_users)}
                subtitle={rangeLabel}
              />
            </section>
          )}

        {/* Secondary cards */}
        <section className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <DashboardCard variant='analytics' className='p-6'>
            <h3 className='text-sm font-medium text-primary-token mb-4'>
              Top Countries
            </h3>
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
              <ul className='divide-y divide-subtle/60'>
                {(data?.top_countries ?? []).map(c => (
                  <li
                    key={c.country}
                    className='flex items-center justify-between py-2'
                  >
                    <span className='text-sm text-secondary-token'>
                      {c.country}
                    </span>
                    <span className='text-sm font-semibold text-primary-token'>
                      {c.count}
                    </span>
                  </li>
                ))}
                {(!data || data.top_countries.length === 0) && !error && (
                  <li className='py-2 text-sm text-secondary-token'>
                    No country data
                  </li>
                )}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard variant='analytics' className='p-6'>
            <h3 className='text-sm font-medium text-primary-token mb-4'>
              Top Referrers
            </h3>
            {loading ? (
              <ul className='space-y-3' aria-hidden='true'>
                {LOADING_SKELETON_KEYS.map(key => (
                  <li key={key} className='flex items-center justify-between'>
                    <LoadingSkeleton height='h-4' width='w-36' rounded='md' />
                    <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className='divide-y divide-subtle/60'>
                {(data?.top_referrers ?? []).map(r => (
                  <li
                    key={r.referrer}
                    className='flex items-center justify-between py-2'
                  >
                    <span className='text-sm text-secondary-token break-all'>
                      {r.referrer}
                    </span>
                    <span className='text-sm font-semibold text-primary-token'>
                      {r.count}
                    </span>
                  </li>
                ))}
                {(!data || data.top_referrers.length === 0) && !error && (
                  <li className='py-2 text-sm text-secondary-token'>
                    No referrer data
                  </li>
                )}
              </ul>
            )}
          </DashboardCard>
        </section>
      </div>
    </div>
  );
}
