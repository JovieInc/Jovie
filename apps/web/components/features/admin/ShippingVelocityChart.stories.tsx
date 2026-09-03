import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShippingVelocityChart } from './ShippingVelocityChart';

const sevenDayVelocity = [
  { date: '2026-08-24', merged: 21, opened: 38, closed: 6 },
  { date: '2026-08-25', merged: 28, opened: 43, closed: 8 },
  { date: '2026-08-26', merged: 35, opened: 47, closed: 9 },
  { date: '2026-08-27', merged: 31, opened: 45, closed: 11 },
  { date: '2026-08-28', merged: 39, opened: 52, closed: 12 },
  { date: '2026-08-29', merged: 42, opened: 58, closed: 13 },
  { date: '2026-08-30', merged: 43, opened: 67, closed: 11 },
];

const meta = {
  title: 'Features/Admin/ShippingVelocityChart',
  component: ShippingVelocityChart,
  parameters: {
    layout: 'centered',
    jovie: {
      // Internal Recharts adapter props and the derived loading state are not
      // part of ShippingVelocityChart's public story API.
      uncoveredProps: [
        'name',
        'value',
        'color',
        'data',
        'spotlight',
        'onLineClick',
        'onChartClick',
        'showClosed',
        'loading',
      ],
    },
  },
  decorators: [
    Story => (
      <div className='w-[min(52rem,calc(100vw-2rem))] rounded-xl border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
  args: {
    initialData: sevenDayVelocity,
    initialRange: '7d',
    cachedAt: new Date().toISOString(),
  },
} satisfies Meta<typeof ShippingVelocityChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SevenDayVelocity: Story = {};
