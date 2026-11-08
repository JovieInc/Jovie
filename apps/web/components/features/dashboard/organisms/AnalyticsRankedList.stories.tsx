import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Globe, MapPin } from 'lucide-react';
import { AnalyticsRankedList } from './AnalyticsRankedList';

const meta = {
  title: 'Dashboard/Organisms/AnalyticsRankedList',
  component: AnalyticsRankedList,
  parameters: {
    layout: 'centered',
  },
  args: {
    icon: MapPin,
    loading: false,
    emptyMessage: 'No city data yet',
    items: [
      { key: 'la', label: 'Los Angeles', value: '412' },
      { key: 'nyc', label: 'New York', value: '268' },
      { key: 'ldn', label: 'London', value: '131' },
      { key: 'ber', label: 'Berlin', value: '74' },
      { key: 'sao', label: 'S%C3%A3o Paulo', value: '29' },
    ],
  },
  decorators: [
    Story => (
      <div className='max-w-full' style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnalyticsRankedList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cities: Story = {};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: { icon: Globe, items: [], emptyMessage: 'No source data yet' },
};

export const EmptyCities: Story = {
  args: {
    items: [],
    emptyMessage: 'No City Data Yet',
    emptyState: {
      description:
        'Cities appear as visitors with a known location open your profile.',
      action: { label: 'View Countries', onClick: () => {} },
    },
  },
};
