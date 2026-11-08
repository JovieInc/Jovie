import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StaticAnalyticsSidebar } from './LazyAnalyticsSidebar';

const meta = {
  title: 'Dashboard/Organisms/LazyAnalyticsSidebar',
  component: StaticAnalyticsSidebar,
  parameters: { layout: 'centered' },
  args: {
    isOpen: true,
    onClose: () => {},
    data: {
      profile_views: 120,
      unique_users: 48,
      subscribers: 12,
      total_clicks: 22,
      listen_clicks: 9,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    },
    testId: 'storybook-lazy-analytics-sidebar',
  },
  decorators: [
    Story => (
      <div className='max-w-full' style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaticAnalyticsSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The demo rail after its chunk loads. */
export const Static: Story = {};
