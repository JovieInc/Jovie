import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LinkAnalyticsPanel } from './LinkAnalyticsPanel';

const meta = {
  title: 'Features/LinkAnalytics/LinkAnalyticsPanel',
  component: LinkAnalyticsPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 rounded-3xl border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkAnalyticsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
