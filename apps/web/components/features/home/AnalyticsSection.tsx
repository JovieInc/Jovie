'use client';

import { NumberedSection } from '@/components/marketing';

const SUB_ITEMS = [
  {
    number: '5.1',
    title: 'Real-time Streams',
    description:
      'Watch streams as they come in. See which releases are gaining momentum.',
  },
  {
    number: '5.2',
    title: 'Geographic Insights',
    description:
      'See where your fans are. Plan tours and campaigns around real listener density.',
  },
  {
    number: '5.3',
    title: 'Campaign Attribution',
    description:
      'Track which campaigns drive results. Know your ROI before you scale spend.',
  },
];

function AnalyticsMockup() {
  return (
    <div
      className='overflow-hidden rounded-[1rem]'
      style={{
        backgroundColor: 'var(--linear-bg-surface-0)',
        boxShadow: 'var(--linear-panel-ring) 0px 0px 0px 1px inset',
      }}
    >
      {/* Window chrome */}
      <div className='flex h-10 items-center border-b border-subtle bg-surface-1 px-4 sm:px-5'>
        <div className='flex gap-2'>
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
        </div>
        <div className='flex-1 text-center text-[var(--linear-caption-size)] text-tertiary-token'>
          Analytics
        </div>
        <div className='w-[52px]' />
      </div>

      <div className='p-5 sm:p-6'>
        {/* Chart header */}
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Streams by release
            </p>
            <p className='mt-1 text-2xl font-semibold tracking-tight text-primary-token'>
              127,482
            </p>
            <p className='text-sm text-secondary-token'>
              <span className='text-emerald-400'>+24%</span> vs last 30 days
            </p>
          </div>
          <div className='flex gap-2'>
            <span className='rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-secondary-token'>
              7d
            </span>
            <span className='rounded-full border border-subtle px-2.5 py-1 text-xs text-tertiary-token'>
              30d
            </span>
            <span className='rounded-full border border-subtle px-2.5 py-1 text-xs text-tertiary-token'>
              90d
            </span>
          </div>
        </div>

        {/* Chart bars */}
        <div className='mt-6 flex items-end gap-1.5 sm:gap-2'>
          {[35, 42, 28, 55, 68, 45, 72, 58, 82, 65, 90, 78, 95, 88].map(
            (height, i) => (
              <div
                key={`bar-${height}`}
                className='flex-1 rounded-t-sm'
                style={{
                  height: `${height}px`,
                  backgroundColor:
                    i >= 12 ? 'var(--linear-accent)' : 'rgba(255,255,255,0.08)',
                }}
              />
            )
          )}
        </div>

        {/* Top cities */}
        <div className='mt-6 grid gap-3 sm:grid-cols-3'>
          {[
            { city: 'Los Angeles', streams: '28,412', pct: '+18%' },
            { city: 'London', streams: '19,847', pct: '+32%' },
            { city: 'New York', streams: '15,203', pct: '+12%' },
          ].map(item => (
            <div
              key={item.city}
              className='rounded-[0.9rem] border border-subtle bg-surface-1 p-3.5'
            >
              <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                {item.city}
              </p>
              <p className='mt-1 text-lg font-semibold tracking-tight text-primary-token'>
                {item.streams}
              </p>
              <p className='text-xs text-emerald-400'>{item.pct}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsSection() {
  return (
    <NumberedSection
      id='analytics'
      sectionNumber='5.0'
      sectionTitle='Analytics'
      heading='Understand your reach.'
      description='Take the guesswork out of music marketing with real-time analytics that surface what needs your attention.'
      subItems={SUB_ITEMS}
    >
      <AnalyticsMockup />
    </NumberedSection>
  );
}
