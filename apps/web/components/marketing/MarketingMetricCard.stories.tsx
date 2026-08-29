import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Activity } from 'lucide-react';
import { MarketingMetricCard } from './MarketingMetricCard';

const meta = {
  title: 'Marketing/Primitives/MarketingMetricCard',
  component: MarketingMetricCard,
  parameters: { layout: 'centered' },
  args: {
    icon: <Activity aria-hidden='true' className='size-4' />,
    label: 'Release reach',
    value: '12,480',
    valueAside: '+18%',
    description: 'Compared with the previous release.',
    testId: 'marketing-metric-card-story',
  },
  render: args => (
    <main className='w-full max-w-sm bg-base p-8 text-primary-token'>
      <MarketingMetricCard {...args} />
    </main>
  ),
} satisfies Meta<typeof MarketingMetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDetails: Story = {};

export const ValueOnly: Story = {
  args: {
    valueAside: undefined,
    description: undefined,
  },
};
