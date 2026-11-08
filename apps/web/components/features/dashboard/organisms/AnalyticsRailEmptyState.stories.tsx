import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AnalyticsRailEmptyState } from './AnalyticsRailEmptyState';

const meta = {
  title: 'Dashboard/Organisms/AnalyticsRailEmptyState',
  component: AnalyticsRailEmptyState,
  parameters: {
    layout: 'centered',
  },
  args: {
    range: '30d',
  },
  decorators: [
    Story => (
      <div className='max-w-full' style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnalyticsRailEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LastThirtyDays: Story = {};

export const LastSevenDays: Story = {
  args: { range: '7d' },
};
