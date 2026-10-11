import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { ContentMetricRow } from './ContentMetricRow';

const meta = {
  title: 'Molecules/ContentMetricRow',
  component: ContentMetricRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Saves',
    value: '3,204',
  },
} satisfies Meta<typeof ContentMetricRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: Music,
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Playlist adds across all connected DSPs',
    value: '42',
  },
};
