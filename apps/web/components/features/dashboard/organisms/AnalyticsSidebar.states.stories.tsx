import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import { AnalyticsSidebarView } from './AnalyticsSidebar';

const data: DashboardAnalyticsResponse = {
  profile_views: 120,
  unique_users: 48,
  subscribers: 12,
  total_clicks: 22,
  listen_clicks: 9,
  tip_link_visits: 4,
  top_cities: [],
  top_countries: [],
  top_referrers: [],
  top_links: [{ id: 'spotify', url: 'Spotify', clicks: 5 }],
};

/**
 * State coverage for the analytics rail. Same args and frame as the
 * canonical Dashboard/Organisms/AnalyticsSidebar stories; each state changes
 * only the analytics payload, the fetch flags, the tab or the direction.
 */
const meta = {
  title: 'Dashboard/Organisms/AnalyticsSidebar States',
  component: AnalyticsSidebarView,
  parameters: {
    layout: 'centered',
  },
  args: {
    isOpen: true,
    onClose: fn(),
    data,
    loading: false,
    isFetching: false,
    range: '30d',
    onRangeChange: fn(),
    activeTab: 'links',
    onActiveTabChange: fn(),
    testId: 'storybook-analytics-sidebar-states',
    tabbedCardTestId: 'storybook-analytics-tabbed-card-states',
  },
  decorators: [
    Story => (
      <div className='max-w-full' style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnalyticsSidebarView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: visits exist but the cities tab has no located visitors yet. */
export const EmptyCitiesTab: Story = {
  args: {
    activeTab: 'cities',
    data: { ...data, top_countries: [{ country: 'United States', count: 9 }] },
  },
};

/** Error: the 7-day fetch failed, so the rail offers Retry instead of zeros. */
export const ErrorSevenDayFetch: Story = {
  args: { range: '7d', data: undefined, onRetry: fn() },
};

/** Partial: no tip-link visits and no ranked sources, so those parts drop out. */
export const PartialNoTipsOrSources: Story = {
  args: {
    activeTab: 'sources',
    data: { ...data, tip_link_visits: 0, top_links: [] },
  },
};

/** Long content: long link labels and large counts in the ranked list. */
export const LongContentLinks: Story = {
  args: {
    data: {
      ...data,
      profile_views: 1284903,
      unique_users: 904117,
      subscribers: 88210,
      total_clicks: 402117,
      listen_clicks: 288104,
      top_links: [
        {
          id: 'a',
          url: 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=release-day',
          clicks: 120443,
        },
        {
          id: 'b',
          url: 'https://music.apple.com/us/album/the-midnight-harbour-sessions',
          clicks: 88210,
        },
        { id: 'c', url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', clicks: 7402 },
      ],
    },
  },
};

/** Offline: a first load paused offline has no data and shows the skeleton, not zeros. */
export const OfflinePausedFirstLoad: Story = {
  args: { loading: true, data: undefined },
};

/** Right-to-left: the rail inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    activeTab: 'cities',
    data: {
      ...data,
      top_cities: [
        { city: 'القاهرة', count: 11 },
        { city: 'دبي', count: 7 },
      ],
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' className='max-w-full' style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
