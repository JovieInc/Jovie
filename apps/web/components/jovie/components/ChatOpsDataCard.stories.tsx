import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { SummerOpsCard } from '@/lib/ovie/ops-card';
import { ChatOpsDataCard } from './ChatOpsDataCard';

const shippingCard: SummerOpsCard = {
  schema: 'summer.ops-card.v1',
  kind: 'shipping',
  title: 'Shipping lanes',
  state: 'fresh',
  observedAt: '2026-09-27T09:00:00.000Z',
  source: 'ubuntu-operational-truth',
  facts: [
    { label: 'Merge queue', value: '3' },
    { label: 'Running tasks', value: '2' },
    { label: 'Blocked', value: 'Not measured' },
  ],
  series: {
    label: 'Live counts',
    points: [
      { label: 'Queued', value: 3 },
      { label: 'Running', value: 2 },
      { label: 'Blocked', value: 1 },
    ],
  },
};

const meta = {
  title: 'Jovie/Components/ChatOpsDataCard',
  component: ChatOpsDataCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-3xl'>
        <Story />
      </div>
    ),
  ],
  args: {
    card: shippingCard,
  },
} satisfies Meta<typeof ChatOpsDataCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fresh: Story = {};

export const WithSummary: Story = {
  args: {
    summary: 'Shipping read complete. 3 queued, 2 running.',
  },
};

export const DegradedNoSeries: Story = {
  args: {
    card: {
      ...shippingCard,
      state: 'degraded',
      observedAt: null,
      series: null,
      facts: [
        { label: 'Merge queue', value: 'Not measured' },
        { label: 'Running tasks', value: 'Not measured' },
      ],
    },
  },
};
