import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileSmartLinkAnalyticsView } from './ProfileSmartLinkAnalytics';

const meta = {
  title: 'Dashboard/Organisms/ProfileSmartLinkAnalytics',
  component: ProfileSmartLinkAnalyticsView,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileUrl: 'https://jov.ie/timwhite',
    range: '30d',
    loading: false,
    variant: 'card',
    data: {
      profile_views: 1240,
      total_clicks: 318,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    },
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileSmartLinkAnalyticsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Loading: Story = {
  args: { loading: true, data: undefined },
};

export const NoVisitsYet: Story = {
  args: {
    data: {
      profile_views: 0,
      total_clicks: 0,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    },
  },
};

export const Unavailable: Story = {
  args: { data: undefined, isError: true },
};

/** A refetch failed after numbers loaded: the last good numbers stay. */
export const ErrorRefetchKeepsNumbers: Story = {
  args: { isError: true },
};

/** Views counted but no link clicks yet: both tiles still show. */
export const PartialViewsOnly: Story = {
  args: {
    data: {
      profile_views: 86,
      total_clicks: 0,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    },
  },
};

/** Large counts and a long profile URL stay inside the rail width. */
export const LongContentLargeCounts: Story = {
  args: {
    profileUrl:
      'https://jov.ie/the-extremely-long-artist-handle-for-a-collective-with-many-members',
    data: {
      profile_views: 128_456_789,
      total_clicks: 98_765_432,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    },
  },
};

/** Offline with no cached numbers: the query is paused, so it stays loading. */
export const OfflineNoCache: Story = {
  args: { loading: true, data: undefined, isFetching: false },
};

export const RtlLoaded: Story = {
  args: { profileUrl: 'https://jov.ie/فنان' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
