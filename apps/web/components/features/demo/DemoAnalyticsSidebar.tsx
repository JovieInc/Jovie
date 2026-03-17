'use client';

import { Globe, Link2, MapPin } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  DrawerSurfaceCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';

/* ------------------------------------------------------------------ */
/*  Hardcoded mock analytics data                                       */
/* ------------------------------------------------------------------ */

const MOCK_ANALYTICS = {
  funnel: {
    profileViews: 12847,
    uniqueVisitors: 9635,
    followers: 5312,
  },
  engagement: {
    captureRate: '41.3%',
    listenClicks: 3421,
    totalClicks: 8934,
    identifiedUsers: 2156,
  },
  topCities: [
    { name: 'Los Angeles', count: 1823 },
    { name: 'New York', count: 1456 },
    { name: 'London', count: 987 },
    { name: 'Toronto', count: 743 },
    { name: 'Berlin', count: 612 },
  ],
  trafficSources: [
    { name: 'Instagram', count: 4521 },
    { name: 'Direct', count: 2134 },
    { name: 'Twitter/X', count: 1876 },
    { name: 'TikTok', count: 1203 },
    { name: 'Spotify', count: 891 },
  ],
  topLinks: [
    { name: 'Spotify', count: 3245 },
    { name: 'Apple Music', count: 2187 },
    { name: 'YouTube', count: 1654 },
    { name: 'SoundCloud', count: 823 },
    { name: 'Bandcamp', count: 412 },
  ],
};

const numberFormatter = new Intl.NumberFormat();

/* ------------------------------------------------------------------ */
/*  Range toggle                                                        */
/* ------------------------------------------------------------------ */

type DemoRange = '7d' | '30d';

const RANGE_OPTIONS: { value: DemoRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function SidebarRangeToggle({
  value,
  onChange,
}: {
  readonly value: DemoRange;
  readonly onChange: (v: DemoRange) => void;
}) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onChange}
      options={RANGE_OPTIONS}
      size='sm'
      className='shrink-0'
      aria-label='Analytics time range'
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Engagement metric card                                              */
/* ------------------------------------------------------------------ */

function EngagementMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <DrawerSurfaceCard className='flex min-w-0 flex-1 flex-col px-3 py-3'>
      <p className='text-3xl font-[590] tracking-[-0.02em] text-primary-token tabular-nums'>
        {value}
      </p>
      <p className='mt-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
    </DrawerSurfaceCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Funnel visualization                                                */
/* ------------------------------------------------------------------ */

function FunnelSection() {
  const stages = [
    {
      label: 'Profile Views',
      value: MOCK_ANALYTICS.funnel.profileViews,
      width: '100%',
    },
    {
      label: 'Unique Visitors',
      value: MOCK_ANALYTICS.funnel.uniqueVisitors,
      width: '75%',
    },
    {
      label: 'Followers',
      value: MOCK_ANALYTICS.funnel.followers,
      width: '55%',
    },
  ];

  return (
    <div className='space-y-2'>
      <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        Funnel
      </p>
      <div className='space-y-1.5'>
        {stages.map((stage, i) => (
          <div key={stage.label}>
            <div
              className='flex items-center justify-between rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-1 px-3 py-2'
              style={{ width: stage.width }}
            >
              <span className='text-[13px] text-secondary-token'>
                {stage.label}
              </span>
              <span className='text-[13px] font-[510] text-primary-token tabular-nums'>
                {numberFormatter.format(stage.value)}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className='flex items-center gap-2 py-0.5 pl-4'>
                <svg
                  width='8'
                  height='12'
                  viewBox='0 0 8 12'
                  fill='none'
                  className='text-tertiary-token'
                  aria-hidden='true'
                >
                  <path
                    d='M4 0v8m0 0L1 5m3 3l3-3'
                    stroke='currentColor'
                    strokeWidth='1.5'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                </svg>
                <span className='text-[11px] text-tertiary-token tabular-nums'>
                  {i === 0
                    ? `${((MOCK_ANALYTICS.funnel.uniqueVisitors / MOCK_ANALYTICS.funnel.profileViews) * 100).toFixed(0)}%`
                    : `${((MOCK_ANALYTICS.funnel.followers / MOCK_ANALYTICS.funnel.uniqueVisitors) * 100).toFixed(0)}%`}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ranked list (cities, sources, links)                                */
/* ------------------------------------------------------------------ */

function RankedList({
  icon: IconComponent,
  items,
}: {
  readonly icon: ComponentType<{ className?: string }>;
  readonly items: readonly { name: string; count: number }[];
}) {
  return (
    <ul className='space-y-1.5'>
      {items.map((item, index) => (
        <li
          key={item.name}
          className='group flex h-8 items-center justify-between rounded-[7px] px-2'
        >
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            <span className='w-3 text-[11px] font-[510] text-tertiary-token tabular-nums'>
              {index + 1}
            </span>
            <IconComponent className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='truncate text-[13px] text-secondary-token transition-colors group-hover:text-primary-token'>
              {item.name}
            </span>
          </div>
          <span className='ml-2 text-[13px] font-[510] text-primary-token tabular-nums'>
            {numberFormatter.format(item.count)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

type AnalyticsTab = 'cities' | 'sources' | 'links';

const ANALYTICS_TAB_OPTIONS = [
  { value: 'cities' as const, label: 'Cities' },
  { value: 'sources' as const, label: 'Sources' },
  { value: 'links' as const, label: 'Links' },
];

export interface DemoAnalyticsSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function DemoAnalyticsSidebar({
  isOpen,
  onClose,
}: DemoAnalyticsSidebarProps) {
  const [range, setRange] = useState<DemoRange>('30d');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('cities');

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Analytics'
      data-testid='demo-analytics-sidebar'
      title='Analytics'
      onClose={onClose}
    >
      <div className='space-y-4'>
        {/* Engagement metrics */}
        <div className='grid grid-cols-3 gap-2'>
          <EngagementMetric
            label='Total Clicks'
            value={numberFormatter.format(
              MOCK_ANALYTICS.engagement.totalClicks
            )}
          />
          <EngagementMetric
            label='Listen Clicks'
            value={numberFormatter.format(
              MOCK_ANALYTICS.engagement.listenClicks
            )}
          />
          <EngagementMetric
            label='Capture Rate'
            value={MOCK_ANALYTICS.engagement.captureRate}
          />
        </div>

        {/* Funnel */}
        <FunnelSection />

        {/* Tabs + range toggle */}
        <div className='flex items-center gap-1.5'>
          <DrawerTabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as AnalyticsTab)}
            options={ANALYTICS_TAB_OPTIONS}
            className='flex-1'
            ariaLabel='Analytics data tabs'
          />
          <SidebarRangeToggle value={range} onChange={setRange} />
        </div>

        {/* Ranked lists */}
        <DrawerSurfaceCard className='min-h-[212px] p-2'>
          {activeTab === 'cities' && (
            <RankedList icon={MapPin} items={MOCK_ANALYTICS.topCities} />
          )}
          {activeTab === 'sources' && (
            <RankedList icon={Globe} items={MOCK_ANALYTICS.trafficSources} />
          )}
          {activeTab === 'links' && (
            <RankedList icon={Link2} items={MOCK_ANALYTICS.topLinks} />
          )}
        </DrawerSurfaceCard>

        {/* Extra engagement stats */}
        <DrawerSurfaceCard className='p-3'>
          <p className='mb-2 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
            Engagement
          </p>
          <div className='grid grid-cols-2 divide-x divide-(--linear-border-subtle)'>
            <div>
              <p className='text-xl font-[590] text-primary-token tabular-nums'>
                {MOCK_ANALYTICS.engagement.captureRate}
              </p>
              <p className='text-[11px] text-tertiary-token'>Capture Rate</p>
            </div>
            <div className='pl-3'>
              <p className='text-xl font-[590] text-primary-token tabular-nums'>
                {numberFormatter.format(
                  MOCK_ANALYTICS.engagement.identifiedUsers
                )}
              </p>
              <p className='text-[11px] text-tertiary-token'>
                Identified Users
              </p>
            </div>
          </div>
        </DrawerSurfaceCard>
      </div>
    </EntitySidebarShell>
  );
}
