'use client';

import { useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { DashboardRefreshButton } from '@/components/dashboard/atoms/DashboardRefreshButton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';
import type { AnalyticsRange } from '@/types/analytics';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

type Range = Extract<AnalyticsRange, '1d' | '7d' | '30d'>;

export function DashboardAnalytics() {
  const dashboardData = useDashboardData();
  const [artist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );

  const [range, setRange] = useState<Range>('7d');

  const { data, error, loading, refresh } = useDashboardAnalytics({
    range,
    view: 'full',
  });

  const rangeLabel = useMemo(() => {
    if (range === '1d') return 'Last 24 hours';
    if (range === '7d') return 'Last 7 days';
    return 'Last 30 days';
  }, [range]);

  if (!artist) return null;

  return (
    <div className='space-y-6'>
      <div className='flex items-start justify-between'>
        <div className='mb-2'>
          <h1 className='text-2xl font-bold text-primary-token'>Analytics</h1>
          <p className='text-secondary-token mt-1'>MVP overview</p>
        </div>
        <div className='flex items-center gap-2'>
          <DashboardRefreshButton
            ariaLabel='Refresh analytics'
            onRefreshed={() => {
              void refresh();
            }}
          />
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>

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

      {/* Secondary cards */}
      <section className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <DashboardCard variant='analytics' className='p-6'>
          <h3 className='text-sm font-medium text-primary-token mb-4'>
            Top Countries
          </h3>
          {loading ? (
            <ul className='space-y-3' aria-hidden='true'>
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className='flex items-center justify-between'>
                  <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                  <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
                </li>
              ))}
            </ul>
          ) : (
            <ul className='divide-y divide-subtle/60'>
              {(data?.top_countries ?? []).map((c, idx) => (
                <li
                  key={c.country + idx}
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
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className='flex items-center justify-between'>
                  <LoadingSkeleton height='h-4' width='w-36' rounded='md' />
                  <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
                </li>
              ))}
            </ul>
          ) : (
            <ul className='divide-y divide-subtle/60'>
              {(data?.top_referrers ?? []).map((r, idx) => (
                <li
                  key={r.referrer + idx}
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
  );
}

function RangeToggle({
  value,
  onChange,
}: {
  value: Range;
  onChange: (v: Range) => void;
}) {
  const options: { label: string; value: Range }[] = [
    { label: '1d', value: '1d' },
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
  ];

  return (
    <div
      role='tablist'
      aria-label='Select analytics range'
      className='inline-flex items-center rounded-full border border-subtle bg-surface-1 p-0.5 shadow-sm'
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role='tab'
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
              active
                ? 'bg-surface-3 text-primary-token shadow-sm'
                : 'text-secondary-token hover:text-primary-token hover:bg-surface-2'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
