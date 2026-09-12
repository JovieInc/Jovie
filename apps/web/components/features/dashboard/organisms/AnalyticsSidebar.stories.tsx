import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AnalyticsSidebarView } from './AnalyticsSidebar';

const meta = {
  title: 'Dashboard/Organisms/AnalyticsSidebar',
  component: AnalyticsSidebarView,
  parameters: {
    layout: 'centered',
  },
  args: {
    isOpen: true,
    onClose: () => {},
    data: {
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
    },
    loading: false,
    isFetching: false,
    range: '30d',
    onRangeChange: () => {},
    activeTab: 'links',
    onActiveTabChange: () => {},
    testId: 'storybook-analytics-sidebar',
    tabbedCardTestId: 'storybook-analytics-tabbed-card',
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

export const FlatRail: Story = {};

export const Loading: Story = {
  args: {
    loading: true,
    data: undefined,
  },
};
