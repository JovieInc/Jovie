import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatRow } from './StatRow';

const STATS = [
  {
    label: 'Total clicks',
    value: '1,204',
    notMeasuredSource: 'smart-link analytics',
  },
  {
    label: 'Last click',
    value: '2h ago',
    notMeasuredSource: 'smart-link analytics',
  },
  {
    label: 'Streams',
    state: 'not-measured' as const,
    notMeasuredSource: 'streaming ingestion',
  },
];

const meta = {
  title: 'Molecules/Drawer/StatRow',
  component: StatRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    stats: STATS,
  },
} satisfies Meta<typeof StatRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    stats: STATS.map(({ label }) => ({ label, state: 'loading' as const })),
  },
};

export const NotMeasured: Story = {
  args: {
    stats: STATS.map(({ label, notMeasuredSource }) => ({
      label,
      notMeasuredSource,
      state: 'not-measured' as const,
    })),
  },
};

export const LongContent: Story = {
  args: {
    stats: [
      { label: 'Top referrer territory this quarter', value: '1,234,567' },
      { label: 'Last click from a referrer', value: '2h ago' },
      { label: 'Streams over the rolling quarter window', value: '89,432' },
    ],
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
};
