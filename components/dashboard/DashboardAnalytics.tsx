'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardAnalyticsProps {
  initialData: DashboardData;
}

type Range = '1d' | '7d' | '30d';

type ApiPayload = {
  total_clicks: number;
  spotify_clicks: number;
  social_clicks: number;
  recent_clicks: number;
  profile_views: number;
  top_countries: { country: string; count: number }[];
  top_referrers: { referrer: string; count: number }[];
};

export function DashboardAnalytics({ initialData }: DashboardAnalyticsProps) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );

  const [range, setRange] = useState<Range>('7d');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiPayload | null>(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/dashboard/analytics?range=${range}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json: ApiPayload = await res.json();
        if (active) setData(json);
      } catch (e) {
        console.error(e);
        if (active) setError('Unable to load analytics');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [range]);

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
        <RangeToggle value={range} onChange={setRange} />
      </div>

      {/* Main card: Profile Views */}
      <section className='bg-surface-1 rounded-xl border border-subtle p-6 shadow-sm hover:shadow-md transition-all'>
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
          <div className='mt-6 h-8 w-40 bg-surface-2 rounded animate-pulse' />
        )}
        {error && (
          <p className='mt-4 text-sm text-orange-600 dark:text-orange-400'>
            {error}
          </p>
        )}
      </section>

      {/* Secondary cards */}
      <section className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <div className='bg-surface-1 rounded-xl border border-subtle p-6 shadow-sm'>
          <h3 className='text-sm font-medium text-primary-token mb-4'>
            Top Countries
          </h3>
          {loading ? (
            <ul className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className='flex items-center justify-between'>
                  <span className='h-4 w-32 bg-surface-2 rounded animate-pulse' />
                  <span className='h-4 w-10 bg-surface-2 rounded animate-pulse' />
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
        </div>

        <div className='bg-surface-1 rounded-xl border border-subtle p-6 shadow-sm'>
          <h3 className='text-sm font-medium text-primary-token mb-4'>
            Top Referrers
          </h3>
          {loading ? (
            <ul className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className='flex items-center justify-between'>
                  <span className='h-4 w-36 bg-surface-2 rounded animate-pulse' />
                  <span className='h-4 w-10 bg-surface-2 rounded animate-pulse' />
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
        </div>
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
            className={`relative px-3 py-1.5 text-sm rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? 'bg-accent text-white'
                : 'text-secondary-token hover:bg-surface-2'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
