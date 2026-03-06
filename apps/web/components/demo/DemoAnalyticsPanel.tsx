'use client';

import {
  ANALYTICS_SUMMARY,
  PLATFORM_CLICKS,
} from '@/components/home/demo/mock-data';

const maxClicks = Math.max(...PLATFORM_CLICKS.map(p => p.clicks));

export function DemoAnalyticsPanel() {
  return (
    <div className='h-full overflow-y-auto'>
      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-3 border-b border-subtle p-4 sm:grid-cols-4'>
        <StatCard
          label='Total Clicks'
          value={ANALYTICS_SUMMARY.totalClicks.toLocaleString()}
        />
        <StatCard
          label='Unique Visitors'
          value={ANALYTICS_SUMMARY.uniqueVisitors.toLocaleString()}
        />
        <StatCard label='Top Platform' value={ANALYTICS_SUMMARY.topPlatform} />
        <StatCard
          label='Growth'
          value={`+${ANALYTICS_SUMMARY.clickGrowth}%`}
          positive
        />
      </div>

      {/* Platform breakdown */}
      <div className='p-4'>
        <h3 className='mb-3 text-2xs uppercase tracking-wider text-tertiary-token [font-weight:var(--font-weight-medium)]'>
          Clicks by Platform
        </h3>
        <div className='space-y-3'>
          {PLATFORM_CLICKS.map(platform => {
            const pct = (platform.clicks / maxClicks) * 100;
            return (
              <div key={platform.platform} className='space-y-1'>
                <div className='flex items-center justify-between text-app'>
                  <span className='text-primary-token'>
                    {platform.platform}
                  </span>
                  <span className='text-2xs text-tertiary-token'>
                    {platform.clicks.toLocaleString()}
                  </span>
                </div>
                <div className='h-2 w-full overflow-hidden rounded-full bg-surface-2'>
                  <div
                    className='h-full rounded-full transition-all duration-slow'
                    style={{
                      width: `${pct}%`,
                      backgroundColor: platform.color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top country + meta */}
      <div className='border-t border-subtle p-4'>
        <h3 className='mb-3 text-2xs uppercase tracking-wider text-tertiary-token [font-weight:var(--font-weight-medium)]'>
          Top Geography
        </h3>
        <div className='flex items-center justify-between text-app'>
          <span className='text-primary-token'>
            {ANALYTICS_SUMMARY.topCountry}
          </span>
          <span className='text-2xs text-tertiary-token'>
            {Math.round(ANALYTICS_SUMMARY.totalClicks * 0.42).toLocaleString()}{' '}
            clicks
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  positive,
}: {
  readonly label: string;
  readonly value: string;
  readonly positive?: boolean;
}) {
  return (
    <div className='rounded-md border border-subtle p-3'>
      <p className='text-2xs text-tertiary-token'>{label}</p>
      <p
        className='mt-1 text-lg font-semibold'
        style={{
          color: positive
            ? 'var(--color-success)'
            : 'var(--color-text-primary-token)',
        }}
      >
        {value}
      </p>
    </div>
  );
}
