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
