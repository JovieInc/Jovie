'use client';

import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  ANALYTICS_SUMMARY,
  PLATFORM_CLICKS,
} from '@/features/home/demo/mock-data';

const maxClicks = Math.max(...PLATFORM_CLICKS.map(p => p.clicks));

export function DemoAnalyticsPanel() {
  return (
    <div className='h-full overflow-y-auto p-4'>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <div className='grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-4'>
          <StatCard
            label='Total Clicks'
            value={ANALYTICS_SUMMARY.totalClicks.toLocaleString()}
          />
          <StatCard
            label='Unique Visitors'
            value={ANALYTICS_SUMMARY.uniqueVisitors.toLocaleString()}
          />
          <StatCard
            label='Top Platform'
            value={ANALYTICS_SUMMARY.topPlatform}
          />
          <StatCard
            label='Growth'
            value={`+${ANALYTICS_SUMMARY.clickGrowth}%`}
            positive
          />
        </div>

        <section className='border-t border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)]'>
          <ContentSectionHeader
            title='Clicks by Platform'
            subtitle='Relative performance of the most-clicked DSP destinations.'
            variant='plain'
            className='px-4 py-3'
          />
          <div className='space-y-3 px-4 py-3'>
            {PLATFORM_CLICKS.map(platform => {
              const pct = (platform.clicks / maxClicks) * 100;
              return (
                <div key={platform.platform} className='space-y-1.5'>
                  <div className='flex items-center justify-between text-[13px]'>
                    <span className='text-primary-token'>
                      {platform.platform}
                    </span>
                    <span className='text-[12px] text-tertiary-token'>
                      {platform.clicks.toLocaleString()}
                    </span>
                  </div>
                  <div className='h-2 w-full overflow-hidden rounded-full bg-surface-1'>
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
        </section>

        <section className='border-t border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)]'>
          <ContentSectionHeader
            title='Top Geography'
            subtitle='Most active market from the current analytics window.'
            variant='plain'
            className='px-4 py-3'
          />
          <div className='flex items-center justify-between px-4 py-3 text-[13px]'>
            <span className='text-primary-token'>
              {ANALYTICS_SUMMARY.topCountry}
            </span>
            <span className='text-[12px] text-tertiary-token'>
              {Math.round(
                ANALYTICS_SUMMARY.totalClicks * 0.42
              ).toLocaleString()}{' '}
              clicks
            </span>
          </div>
        </section>
      </ContentSurfaceCard>
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
    <ContentMetricCard
      label={label}
      value={value}
      className='border-0 bg-transparent p-3 shadow-none'
      labelClassName='text-[11px] tracking-[0.04em]'
      subtitleClassName='hidden'
      valueClassName={
        positive
          ? 'text-[22px] font-[620] tracking-[-0.025em] text-[var(--color-success)]'
          : 'text-[22px] font-[620] tracking-[-0.025em]'
      }
    />
  );
}
