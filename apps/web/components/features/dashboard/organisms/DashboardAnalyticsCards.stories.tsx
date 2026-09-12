import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardAnalyticsCards } from './DashboardAnalyticsCards';

const meta = {
  title: 'Dashboard/Organisms/DashboardAnalyticsCards',
  component: DashboardAnalyticsCards,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-md text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    profileUrl: 'https://jovie.test/midnightsignal',
    range: '7d',
    refreshSignal: 0,
  },
} satisfies Meta<typeof DashboardAnalyticsCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
