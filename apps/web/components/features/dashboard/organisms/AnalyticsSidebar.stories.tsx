import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import { StaticAnalyticsSidebar } from './AnalyticsSidebar';

const analytics: DashboardAnalyticsResponse = {
  profile_views: 12_847,
  unique_users: 9_635,
  subscribers: 5_312,
  total_clicks: 8_934,
  listen_clicks: 3_421,
  tip_link_visits: 624,
  top_cities: [{ city: 'Los Angeles', count: 1_823 }],
  top_countries: [{ country: 'United States', count: 5_814 }],
  top_referrers: [{ referrer: 'Instagram', count: 4_521 }],
  top_links: [{ id: 'spotify', url: 'Spotify', clicks: 3_245 }],
};

const meta: Meta<typeof StaticAnalyticsSidebar> = {
  title: 'Dashboard/Audience/AnalyticsSidebar',
  component: StaticAnalyticsSidebar,
  parameters: { layout: 'fullscreen' },
  args: {
    isOpen: true,
    onClose: fn(),
    data: analytics,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Compact: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
