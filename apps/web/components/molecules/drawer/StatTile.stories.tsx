import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatTile } from './StatTile';

const meta = {
  title: 'Molecules/Drawer/StatTile',
  component: StatTile,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-40 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Views',
    value: '12.4k',
  },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: '+8% vs last week',
  },
};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
};

export const NotMeasured: Story = {
  args: {
    state: 'not-measured',
    notMeasuredSource: 'streaming ingestion',
  },
};

export const LongContent: Story = {
  args: {
    label: 'Top referrer territory this quarter',
    value: '1,234,567',
    hint: 'Measures the leading territory by referred clicks over the rolling quarter window',
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-40 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
};
